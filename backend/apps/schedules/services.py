from django.db import models, transaction
from django.utils import timezone

from apps.audit.services import AuditService
from apps.notifications.services import NotificationService

from .models import (
    CheckoutRecord,
    Schedule,
    ScheduleEquipment,
    ScheduleStatusLog,
)


class InvalidScheduleTransitionError(Exception):
    def __init__(self, from_status: str, to_status: str, detail: str = ""):
        self.from_status = from_status
        self.to_status = to_status
        msg = f"Invalid schedule transition: {from_status} → {to_status}"
        if detail:
            msg += f" ({detail})"
        super().__init__(msg)


class ScheduleStatusService:
    """Manages schedule status transitions (state machine)."""

    VALID_TRANSITIONS: dict[str, list[str]] = {
        "draft": ["confirmed", "cancelled"],
        "confirmed": ["in_progress", "cancelled", "draft"],
        "in_progress": ["completed", "cancelled"],
        "cancelled": ["draft"],
    }

    @classmethod
    def confirm(cls, schedule: Schedule, user, *, notes: str = "") -> Schedule:
        """DRAFT → CONFIRMED. Validates equipment and contact info."""
        cls._validate_transition(schedule, "confirmed")

        if not schedule.contact_name and schedule.schedule_type == Schedule.ScheduleType.EVENT:
            raise InvalidScheduleTransitionError(
                schedule.status, "confirmed",
                "Contact name is required for confirmed events",
            )

        if schedule.start_datetime >= schedule.end_datetime:
            raise InvalidScheduleTransitionError(
                schedule.status, "confirmed",
                "Start datetime must be before end datetime",
            )

        with transaction.atomic():
            locked = Schedule.objects.select_for_update().get(pk=schedule.pk)
            from_status = locked.status
            locked.status = Schedule.Status.CONFIRMED
            locked.confirmed_at = timezone.now()
            locked.confirmed_by = user
            locked.save(update_fields=[
                "status", "confirmed_at", "confirmed_by", "updated_at",
            ])

            ScheduleStatusLog.objects.create(
                schedule=locked,
                from_status=from_status,
                to_status="confirmed",
                changed_by=user,
                notes=notes,
            )

        AuditService.log_schedule_action(
            user=user, action="confirm", schedule=locked,
            description=f'Confirmed schedule "{locked.title}"',
        )
        NotificationService.on_schedule_status_change(locked, "confirmed", user)
        return locked

    @classmethod
    def begin(cls, schedule: Schedule, user, *, notes: str = "") -> Schedule:
        """CONFIRMED → IN_PROGRESS. Auto-triggered on first checkout."""
        cls._validate_transition(schedule, "in_progress")

        with transaction.atomic():
            locked = Schedule.objects.select_for_update().get(pk=schedule.pk)
            from_status = locked.status
            locked.status = Schedule.Status.IN_PROGRESS
            locked.started_at = timezone.now()
            locked.save(update_fields=["status", "started_at", "updated_at"])

            ScheduleStatusLog.objects.create(
                schedule=locked,
                from_status=from_status,
                to_status="in_progress",
                changed_by=user,
                notes=notes or "Auto-transitioned on first equipment checkout",
            )

        AuditService.log_schedule_action(
            user=user, action="begin", schedule=locked,
            description=f'Schedule "{locked.title}" is now in progress',
        )
        NotificationService.on_schedule_status_change(locked, "started", user)
        return locked

    @classmethod
    def complete(cls, schedule: Schedule, user, *, notes: str = "") -> Schedule:
        """IN_PROGRESS → COMPLETED. Validates all equipment returned."""
        cls._validate_transition(schedule, "completed")

        # Check all active checkout records are closed
        active_checkouts = CheckoutRecord.objects.filter(
            schedule_equipment__schedule=schedule,
            checked_in_at__isnull=True,
            transferred_at__isnull=True,
        ).exists()

        if active_checkouts:
            raise InvalidScheduleTransitionError(
                schedule.status, "completed",
                "All checked-out equipment must be returned before completing",
            )

        with transaction.atomic():
            locked = Schedule.objects.select_for_update().get(pk=schedule.pk)
            from_status = locked.status
            locked.status = Schedule.Status.COMPLETED
            locked.completed_at = timezone.now()
            locked.save(update_fields=["status", "completed_at", "updated_at"])

            ScheduleStatusLog.objects.create(
                schedule=locked,
                from_status=from_status,
                to_status="completed",
                changed_by=user,
                notes=notes,
            )

        AuditService.log_schedule_action(
            user=user, action="complete", schedule=locked,
            description=f'Completed schedule "{locked.title}"',
        )
        NotificationService.on_schedule_status_change(locked, "completed", user)
        if locked.schedule_type == Schedule.ScheduleType.EXTERNAL_REPAIR:
            NotificationService.on_repair_completed(locked, user)
        return locked

    @classmethod
    def cancel(cls, schedule: Schedule, user, *, reason: str = "", force: bool = False, notes: str = "") -> Schedule:
        """ANY (except COMPLETED) → CANCELLED."""
        cls._validate_transition(schedule, "cancelled")

        if schedule.status == "in_progress" and not force:
            raise InvalidScheduleTransitionError(
                schedule.status, "cancelled",
                "Use force=True to cancel an in-progress schedule",
            )

        with transaction.atomic():
            locked = Schedule.objects.select_for_update().get(pk=schedule.pk)
            from_status = locked.status
            locked.status = Schedule.Status.CANCELLED
            locked.cancelled_at = timezone.now()
            locked.cancelled_by = user
            locked.cancellation_reason = reason
            locked.save(update_fields=[
                "status", "cancelled_at", "cancelled_by",
                "cancellation_reason", "updated_at",
            ])

            # Cancel child dispatch events too
            locked.dispatch_events.exclude(
                status=Schedule.Status.CANCELLED
            ).update(
                status=Schedule.Status.CANCELLED,
                cancelled_at=timezone.now(),
                cancelled_by=user,
                cancellation_reason="Parent schedule cancelled",
            )

            ScheduleStatusLog.objects.create(
                schedule=locked,
                from_status=from_status,
                to_status="cancelled",
                changed_by=user,
                notes=notes or reason,
            )

        AuditService.log_schedule_action(
            user=user, action="cancel", schedule=locked,
            description=f'Cancelled schedule "{locked.title}"',
        )
        NotificationService.on_schedule_status_change(locked, "cancelled", user)
        return locked

    @classmethod
    def reopen(cls, schedule: Schedule, user, *, notes: str = "") -> Schedule:
        """CANCELLED → DRAFT. Reopens a cancelled schedule."""
        cls._validate_transition(schedule, "draft")

        if schedule.status != "cancelled":
            raise InvalidScheduleTransitionError(
                schedule.status, "draft",
                "Only cancelled schedules can be reopened",
            )

        with transaction.atomic():
            locked = Schedule.objects.select_for_update().get(pk=schedule.pk)
            from_status = locked.status
            locked.status = Schedule.Status.DRAFT
            locked.cancelled_at = None
            locked.cancelled_by = None
            locked.cancellation_reason = ""
            locked.confirmed_at = None
            locked.confirmed_by = None
            locked.save(update_fields=[
                "status", "cancelled_at", "cancelled_by",
                "cancellation_reason", "confirmed_at", "confirmed_by",
                "updated_at",
            ])

            ScheduleStatusLog.objects.create(
                schedule=locked,
                from_status=from_status,
                to_status="draft",
                changed_by=user,
                notes=notes or "Reopened from cancelled",
            )

        AuditService.log_schedule_action(
            user=user, action="reopen", schedule=locked,
            description=f'Reopened schedule "{locked.title}"',
        )
        return locked

    @classmethod
    def _validate_transition(cls, schedule: Schedule, target_status: str):
        allowed = cls.VALID_TRANSITIONS.get(schedule.status, [])
        if target_status not in allowed:
            raise InvalidScheduleTransitionError(schedule.status, target_status)


class AvailabilityService:
    """Computes equipment availability for scheduling."""

    @classmethod
    def get_model_availability(cls, equipment_model, start, end, exclude_schedule=None):
        """Calculate availability of an equipment model for a time range."""
        from apps.equipment.models import EquipmentItem

        # 1. Total dispatchable (owned + rented-in received)
        if equipment_model.is_numbered:
            total_owned = equipment_model.items.filter(
                ownership_type=EquipmentItem.OwnershipType.OWNED,
                is_active=True,
                current_status__in=["available", "reserved", "out"],
            ).count()
            rental_received = equipment_model.items.filter(
                ownership_type=EquipmentItem.OwnershipType.RENTED_IN,
                is_active=True,
                current_status__in=["available", "reserved", "out"],
            ).count()
        else:
            total_owned = equipment_model.total_quantity
            rental_received = 0

        total_dispatchable = total_owned + rental_received

        # 2. Allocated by other schedules in the same time range
        allocated = cls._get_allocated_quantity(
            equipment_model, start, end, exclude_schedule
        )

        # 3. Pending rental-in
        if equipment_model.is_numbered:
            pending_rental_in = equipment_model.items.filter(
                ownership_type=EquipmentItem.OwnershipType.RENTED_IN,
                is_active=True,
                current_status="pending_receipt",
                rental_agreement__end_date__gte=start,
            ).count()
        else:
            pending_rental_in = 0

        confirmed_available = total_dispatchable - allocated

        return {
            "total_owned": total_owned,
            "rental_received": rental_received,
            "total_dispatchable": total_dispatchable,
            "allocated_by_others": allocated,
            "confirmed_available": max(0, confirmed_available),
            "pending_rental_in": pending_rental_in,
            "projected_available": max(0, confirmed_available + pending_rental_in),
        }

    @classmethod
    def _get_allocated_quantity(cls, equipment_model, start, end, exclude_schedule=None):
        """Get total quantity allocated by overlapping schedules."""
        qs = ScheduleEquipment.objects.filter(
            equipment_model=equipment_model,
            schedule__start_datetime__lt=end,
            schedule__end_datetime__gt=start,
            schedule__status__in=[
                Schedule.Status.CONFIRMED,
                Schedule.Status.IN_PROGRESS,
            ],
        )
        if exclude_schedule:
            qs = qs.exclude(schedule=exclude_schedule)

        result = qs.aggregate(total=models.Sum("quantity_planned"))
        return result["total"] or 0

    @classmethod
    def check_conflicts(cls, schedule, equipment_list=None):
        """Check and update over-allocation flags for a schedule's equipment.
        equipment_list: optional list of dicts with equipment_model_uuid and quantity.
        If None, checks existing ScheduleEquipment records."""
        had_conflicts = bool(schedule.has_conflicts)
        has_any_conflict = False

        allocations = ScheduleEquipment.objects.filter(
            schedule=schedule
        ).select_related("equipment_model")

        for alloc in allocations:
            avail = cls.get_model_availability(
                alloc.equipment_model,
                schedule.start_datetime,
                schedule.end_datetime,
                exclude_schedule=schedule,
            )
            is_over = alloc.quantity_planned > avail["confirmed_available"]
            if alloc.is_over_allocated != is_over:
                alloc.is_over_allocated = is_over
                alloc.save(update_fields=["is_over_allocated", "updated_at"])
            if is_over:
                has_any_conflict = True

        if schedule.has_conflicts != has_any_conflict:
            Schedule.objects.filter(pk=schedule.pk).update(
                has_conflicts=has_any_conflict
            )

        if has_any_conflict and not had_conflicts:
            NotificationService.on_equipment_conflict(schedule)

        return has_any_conflict

    @classmethod
    def batch_check_availability(cls, start, end, equipment_requests, exclude_schedule=None):
        """Check availability for multiple equipment models at once.
        equipment_requests: list of {"equipment_model": model, "quantity": int}"""
        from apps.equipment.models import EquipmentModel

        results = []
        has_any_conflict = False

        for req in equipment_requests:
            model = req["equipment_model"]
            requested = req["quantity"]
            avail = cls.get_model_availability(model, start, end, exclude_schedule)
            is_sufficient = requested <= avail["confirmed_available"]

            result = {
                "equipment_model": {
                    "uuid": str(model.uuid),
                    "name": str(model),
                },
                "requested": requested,
                "confirmed_available": avail["confirmed_available"],
                "projected_available": avail["projected_available"],
                "is_sufficient": is_sufficient,
                "shortage": max(0, requested - avail["confirmed_available"]),
            }

            if not is_sufficient:
                has_any_conflict = True
                # Find conflicting schedules
                conflicting = ScheduleEquipment.objects.filter(
                    equipment_model=model,
                    schedule__start_datetime__lt=end,
                    schedule__end_datetime__gt=start,
                    schedule__status__in=["confirmed", "in_progress"],
                ).select_related("schedule")
                if exclude_schedule:
                    conflicting = conflicting.exclude(schedule=exclude_schedule)

                result["conflicting_schedules"] = [
                    {
                        "uuid": str(se.schedule.uuid),
                        "title": se.schedule.title,
                        "planned": se.quantity_planned,
                        "period": f"{se.schedule.start_datetime.strftime('%m/%d')}-{se.schedule.end_datetime.strftime('%m/%d')}",
                    }
                    for se in conflicting
                ]

            results.append(result)

        return {"results": results, "has_any_conflict": has_any_conflict}
