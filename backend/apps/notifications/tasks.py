import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Exists, OuterRef, Subquery
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_notification_email(self, recipient_email, subject, message):
    """Send email notification asynchronously via Celery."""
    try:
        send_mail(
            subject=f"[SMS] {subject}",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
    except Exception as exc:
        self.retry(exc=exc)


# ── Periodic Tasks ───────────────────────────────────────────────────────


@shared_task
def check_upcoming_events():
    """Notify schedule creators about confirmed schedules starting within 24h."""
    from apps.notifications.models import Notification
    from apps.notifications.services import NotificationService
    from apps.schedules.models import Schedule

    now = timezone.now()
    window_end = now + timedelta(hours=24)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    schedules = (
        Schedule.objects.filter(
            status=Schedule.Status.CONFIRMED,
            start_datetime__gt=now,
            start_datetime__lte=window_end,
            parent__isnull=True,
            created_by__isnull=False,
        )
        .select_related("created_by")
    )

    count = 0
    for schedule in schedules:
        # Dedup: skip if already notified today for this schedule
        already_notified = Notification.objects.filter(
            recipient=schedule.created_by,
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            title__startswith="Upcoming:",
            created_at__gte=today_start,
        ).exists()

        if already_notified:
            continue

        NotificationService.notify(
            recipient=schedule.created_by,
            category=Notification.Category.SCHEDULE,
            title=f"Upcoming: {schedule.title}",
            message=f'Schedule "{schedule.title}" starts {schedule.start_datetime.strftime("%m/%d %H:%M")}.',
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            event_type="upcoming_event",
        )
        count += 1

    logger.info("check_upcoming_events: notified %d schedules", count)
    return count


@shared_task
def check_equipment_due_return():
    """Notify managers about in-progress schedules past end_datetime with active checkouts."""
    from apps.accounts.models import User
    from apps.notifications.models import Notification
    from apps.notifications.services import NotificationService
    from apps.schedules.models import CheckoutRecord, Schedule

    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    overdue_schedules = (
        Schedule.objects.filter(
            status=Schedule.Status.IN_PROGRESS,
            end_datetime__lt=now,
            parent__isnull=True,
        )
        .annotate(
            has_active_checkout=Exists(
                CheckoutRecord.objects.filter(
                    schedule_equipment__schedule=OuterRef("pk"),
                    checked_in_at__isnull=True,
                    transferred_at__isnull=True,
                )
            )
        )
        .filter(has_active_checkout=True)
    )

    managers = User.objects.filter(can_manage_schedules=True, is_active=True)

    count = 0
    for schedule in overdue_schedules:
        # Dedup: skip if already notified today
        already_notified = Notification.objects.filter(
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            title__startswith="Overdue:",
            created_at__gte=today_start,
        ).exists()

        if already_notified:
            continue

        NotificationService.notify_many(
            recipients=managers,
            category=Notification.Category.WAREHOUSE,
            severity=Notification.Severity.ERROR,
            title=f"Overdue: {schedule.title}",
            message=f'Schedule "{schedule.title}" ended {schedule.end_datetime.strftime("%m/%d %H:%M")} but has unreturned equipment.',
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            event_type="equipment_due_return",
        )
        count += 1

    logger.info("check_equipment_due_return: notified %d overdue schedules", count)
    return count


@shared_task
def check_rental_expiring():
    """Notify about active rentals expiring within 7 days."""
    from apps.notifications.models import Notification
    from apps.notifications.services import NotificationService
    from apps.rentals.models import RentalAgreement

    now = timezone.now()
    today = now.date()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    window_end = today + timedelta(days=7)

    expiring = RentalAgreement.objects.filter(
        status=RentalAgreement.Status.ACTIVE,
        end_date__gte=today,
        end_date__lte=window_end,
        created_by__isnull=False,
    ).select_related("created_by")

    count = 0
    for agreement in expiring:
        days_left = (agreement.end_date - today).days

        # Dedup: skip if already notified today
        already_notified = Notification.objects.filter(
            recipient=agreement.created_by,
            entity_type="rental_agreement",
            entity_uuid=agreement.uuid,
            title__startswith="Rental expiring",
            created_at__gte=today_start,
        ).exists()

        if already_notified:
            continue

        if days_left <= 1:
            severity = Notification.Severity.ERROR
        elif days_left <= 3:
            severity = Notification.Severity.WARNING
        else:
            severity = Notification.Severity.INFO

        NotificationService.notify(
            recipient=agreement.created_by,
            category=Notification.Category.RENTAL,
            severity=severity,
            title=f"Rental expiring: {agreement.vendor_name}",
            message=f"Agreement {agreement.agreement_number} expires in {days_left} day(s) on {agreement.end_date.strftime('%m/%d')}.",
            entity_type="rental_agreement",
            entity_uuid=agreement.uuid,
            event_type="rental_expiring",
        )
        count += 1

    logger.info("check_rental_expiring: notified %d expiring rentals", count)
    return count


@shared_task
def reconcile_equipment_status():
    """Daily reconciliation: fix equipment status mismatches and orphaned checkouts."""
    from apps.accounts.models import User
    from apps.equipment.models import EquipmentItem, EquipmentStatusLog
    from apps.notifications.services import NotificationService
    from apps.schedules.models import CheckoutRecord

    fixes = []

    # Get a system user for performed_by (required NOT NULL field)
    system_user = (
        User.objects.filter(is_superuser=True, is_active=True).first()
        or User.objects.filter(can_manage_equipment=True, is_active=True).first()
    )
    if not system_user:
        logger.warning("reconcile_equipment_status: no admin user found, skipping")
        return 0

    # 1. Check numbered items: current_status vs latest EquipmentStatusLog
    numbered_items = EquipmentItem.objects.filter(
        is_active=True,
        equipment_model__is_numbered=True,
    ).select_related("equipment_model")

    for item in numbered_items:
        latest_log = (
            EquipmentStatusLog.objects.filter(equipment_item=item)
            .order_by("-created_at")
            .first()
        )
        if not latest_log:
            continue

        if item.current_status != latest_log.to_status:
            old_status = item.current_status
            item.current_status = latest_log.to_status
            item.save(update_fields=["current_status", "updated_at"])

            EquipmentStatusLog.objects.create(
                equipment_item=item,
                action=EquipmentStatusLog.Action.RECONCILE,
                from_status=old_status,
                to_status=latest_log.to_status,
                performed_by=system_user,
                notes="Auto-reconciled by system",
            )
            fixes.append(
                f"{item}: {old_status} → {latest_log.to_status}"
            )

    # 2. Check orphaned CheckoutRecords (not checked in, not transferred, but item is available)
    orphaned = CheckoutRecord.objects.filter(
        checked_in_at__isnull=True,
        transferred_at__isnull=True,
        equipment_item__isnull=False,
        equipment_item__current_status="available",
    ).select_related("equipment_item")

    for record in orphaned:
        fixes.append(
            f"Orphaned checkout: {record.equipment_item} (CheckoutRecord #{record.pk})"
        )

    # Notify managers if there were any fixes
    if fixes:
        managers = User.objects.filter(can_manage_equipment=True, is_active=True)
        summary = "\n".join(f"• {f}" for f in fixes[:20])
        if len(fixes) > 20:
            summary += f"\n... and {len(fixes) - 20} more"

        NotificationService.notify_many(
            recipients=managers,
            category="system",
            severity="warning",
            title=f"Reconciliation: {len(fixes)} issue(s) found",
            message=f"Daily equipment status reconciliation found {len(fixes)} discrepancy(ies):\n{summary}",
            event_type="system",
        )

    logger.info("reconcile_equipment_status: %d fixes", len(fixes))
    return len(fixes)
