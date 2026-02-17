from django.db.models import QuerySet

from apps.accounts.models import User

from .models import (
    DEFAULT_PREFERENCES,
    Notification,
    UserNotificationPreference,
)


def get_user_preference(user: User, event_type: str, channel: str) -> bool:
    """Check if a user has a channel enabled for an event type.

    Returns the explicit override if it exists, otherwise the system default.
    """
    try:
        pref = UserNotificationPreference.objects.get(
            user=user, event_type=event_type, channel=channel,
        )
        return pref.is_enabled
    except UserNotificationPreference.DoesNotExist:
        return DEFAULT_PREFERENCES.get((event_type, channel), False)


class NotificationService:
    """Central service for creating and dispatching notifications."""

    @staticmethod
    def notify(
        *,
        recipient: User,
        category: str,
        title: str,
        message: str,
        severity: str = Notification.Severity.INFO,
        entity_type: str = "",
        entity_uuid=None,
        actor: User | None = None,
        event_type: str | None = None,
    ) -> Notification | None:
        """Create a notification and optionally dispatch email.

        When event_type is provided, user preferences are checked per channel.
        When event_type is None, in-app notification is always created (legacy).
        """
        notification = None

        # In-app channel
        should_in_app = True
        if event_type:
            should_in_app = get_user_preference(recipient, event_type, "in_app")

        if should_in_app:
            notification = Notification.objects.create(
                recipient=recipient,
                category=category,
                severity=severity,
                title=title,
                message=message,
                entity_type=entity_type,
                entity_uuid=entity_uuid,
                actor=actor,
            )

        # Email channel
        if event_type and get_user_preference(recipient, event_type, "email"):
            if recipient.email:
                from .tasks import send_notification_email

                send_notification_email.delay(recipient.email, title, message)

        return notification

    @staticmethod
    def notify_many(
        *,
        recipients: QuerySet | list[User],
        category: str,
        title: str,
        message: str,
        severity: str = Notification.Severity.INFO,
        entity_type: str = "",
        entity_uuid=None,
        actor: User | None = None,
        event_type: str | None = None,
    ) -> list[Notification]:
        """Create notifications for multiple recipients, respecting preferences."""
        recipient_list = list(recipients)

        if not event_type:
            # Legacy path — always create for everyone
            notifications = [
                Notification(
                    recipient=user,
                    category=category,
                    severity=severity,
                    title=title,
                    message=message,
                    entity_type=entity_type,
                    entity_uuid=entity_uuid,
                    actor=actor,
                )
                for user in recipient_list
            ]
            return Notification.objects.bulk_create(notifications)

        # Preference-aware path
        # Batch-fetch all relevant preferences
        user_ids = [u.pk for u in recipient_list]
        overrides = {}
        for pref in UserNotificationPreference.objects.filter(
            user_id__in=user_ids, event_type=event_type,
        ):
            overrides[(pref.user_id, pref.channel)] = pref.is_enabled

        in_app_recipients = []
        email_recipients = []

        for user in recipient_list:
            # In-app
            in_app_key = (user.pk, "in_app")
            should_in_app = overrides.get(
                in_app_key,
                DEFAULT_PREFERENCES.get((event_type, "in_app"), False),
            )
            if should_in_app:
                in_app_recipients.append(user)

            # Email
            email_key = (user.pk, "email")
            should_email = overrides.get(
                email_key,
                DEFAULT_PREFERENCES.get((event_type, "email"), False),
            )
            if should_email and user.email:
                email_recipients.append(user)

        # Bulk create in-app notifications
        notifications = []
        if in_app_recipients:
            notifications = Notification.objects.bulk_create([
                Notification(
                    recipient=user,
                    category=category,
                    severity=severity,
                    title=title,
                    message=message,
                    entity_type=entity_type,
                    entity_uuid=entity_uuid,
                    actor=actor,
                )
                for user in in_app_recipients
            ])

        # Queue emails
        if email_recipients:
            from .tasks import send_notification_email

            for user in email_recipients:
                send_notification_email.delay(user.email, title, message)

        return notifications

    # ── Trigger helpers ───────────────────────────────────────────

    @classmethod
    def on_warehouse_pending(cls, transaction, performer):
        """Notify users who can confirm a pending warehouse transaction."""
        confirmers = User.objects.filter(
            can_check_in=True, is_active=True,
        ).exclude(pk=performer.pk)

        label = transaction.get_transaction_type_display()
        schedule_title = ""
        if transaction.schedule:
            schedule_title = f" for {transaction.schedule.title}"

        cls.notify_many(
            recipients=confirmers,
            category=Notification.Category.WAREHOUSE,
            severity=Notification.Severity.WARNING,
            title=f"{label} awaiting confirmation",
            message=f"{performer} created a {label.lower()}{schedule_title} that requires your confirmation.",
            entity_type="warehouse_transaction",
            entity_uuid=transaction.uuid,
            actor=performer,
            event_type="pending_confirmation",
        )

    @classmethod
    def on_warehouse_confirmed(cls, transaction, confirmer):
        """Notify the performer that their transaction was confirmed."""
        label = transaction.get_transaction_type_display()
        cls.notify(
            recipient=transaction.performed_by,
            category=Notification.Category.WAREHOUSE,
            title=f"{label} confirmed",
            message=f"Your {label.lower()} has been confirmed by {confirmer}.",
            entity_type="warehouse_transaction",
            entity_uuid=transaction.uuid,
            actor=confirmer,
            event_type="pending_confirmation",
        )

    @classmethod
    def on_warehouse_cancelled(cls, transaction, canceller):
        """Notify the performer that their transaction was cancelled."""
        label = transaction.get_transaction_type_display()
        cls.notify(
            recipient=transaction.performed_by,
            category=Notification.Category.WAREHOUSE,
            severity=Notification.Severity.WARNING,
            title=f"{label} cancelled",
            message=f"Your {label.lower()} has been cancelled by {canceller}.",
            entity_type="warehouse_transaction",
            entity_uuid=transaction.uuid,
            actor=canceller,
            event_type="pending_confirmation",
        )

    @classmethod
    def on_schedule_status_change(cls, schedule, new_status, changed_by):
        """Notify the schedule creator about status changes."""
        if schedule.created_by and schedule.created_by != changed_by:
            cls.notify(
                recipient=schedule.created_by,
                category=Notification.Category.SCHEDULE,
                title=f"Schedule {new_status}",
                message=f'"{schedule.title}" has been {new_status} by {changed_by}.',
                entity_type="schedule",
                entity_uuid=schedule.uuid,
                actor=changed_by,
                event_type="schedule_changed",
            )

    @classmethod
    def on_repair_completed(cls, schedule, changed_by):
        """Notify equipment managers when an external repair is completed."""
        managers = User.objects.filter(
            can_manage_equipment=True, is_active=True,
        ).exclude(pk=changed_by.pk)

        cls.notify_many(
            recipients=managers,
            category=Notification.Category.SCHEDULE,
            title=f"Repair completed: {schedule.title}",
            message=(
                f'External repair "{schedule.title}" has been completed by {changed_by}. '
                f"Please check in the returned equipment via Warehouse → Check In."
            ),
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            actor=changed_by,
            event_type="repair_completed",
        )

    @classmethod
    def on_equipment_conflict(cls, schedule):
        """Notify equipment managers when a schedule has over-allocation conflicts."""
        managers = User.objects.filter(
            can_manage_equipment=True, is_active=True,
        )

        cls.notify_many(
            recipients=managers,
            category=Notification.Category.EQUIPMENT,
            severity=Notification.Severity.WARNING,
            title=f"Equipment conflict: {schedule.title}",
            message=(
                f'Schedule "{schedule.title}" has over-allocated equipment '
                "and requires review."
            ),
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            event_type="equipment_conflict",
        )

    @classmethod
    def on_fault_reported(cls, fault, reporter):
        """Notify equipment managers about new faults."""
        managers = User.objects.filter(
            can_manage_equipment=True, is_active=True,
        ).exclude(pk=reporter.pk)

        severity = Notification.Severity.WARNING
        if fault.severity in ("high", "critical"):
            severity = Notification.Severity.ERROR

        cls.notify_many(
            recipients=managers,
            category=Notification.Category.EQUIPMENT,
            severity=severity,
            title=f"Fault reported: {fault.title}",
            message=f"{reporter} reported a {fault.get_severity_display().lower()} fault on {fault.equipment_item}.",
            entity_type="equipment_item",
            entity_uuid=fault.equipment_item.uuid,
            actor=reporter,
            event_type="fault_reported",
        )

    @classmethod
    def on_rental_status_change(cls, agreement, new_status, changed_by):
        """Notify the agreement creator about status changes."""
        if agreement.created_by and agreement.created_by != changed_by:
            cls.notify(
                recipient=agreement.created_by,
                category=Notification.Category.RENTAL,
                title=f"Rental {new_status}",
                message=f"Agreement {agreement.agreement_number} has been {new_status} by {changed_by}.",
                entity_type="rental_agreement",
                entity_uuid=agreement.uuid,
                actor=changed_by,
                event_type="rental_expiring",
            )

    @classmethod
    def on_transfer_executed(cls, transfer, performer):
        """Notify schedule owners about executed transfers."""
        recipients = set()
        if transfer.from_schedule.created_by:
            recipients.add(transfer.from_schedule.created_by)
        if transfer.to_schedule.created_by:
            recipients.add(transfer.to_schedule.created_by)
        recipients.discard(performer)

        if recipients:
            cls.notify_many(
                recipients=list(recipients),
                category=Notification.Category.TRANSFER,
                title="Equipment transferred",
                message=f"{performer} transferred equipment from \"{transfer.from_schedule.title}\" to \"{transfer.to_schedule.title}\".",
                entity_type="equipment_transfer",
                entity_uuid=transfer.uuid,
                actor=performer,
                event_type="equipment_transferred",
            )
