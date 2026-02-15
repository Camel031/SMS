from django.db.models import QuerySet

from apps.accounts.models import User

from .models import Notification


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
    ) -> Notification:
        return Notification.objects.create(
            recipient=recipient,
            category=category,
            severity=severity,
            title=title,
            message=message,
            entity_type=entity_type,
            entity_uuid=entity_uuid,
            actor=actor,
        )

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
    ) -> list[Notification]:
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
            for user in recipients
        ]
        return Notification.objects.bulk_create(notifications)

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
            )
