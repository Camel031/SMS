from django.db import transaction

from .models import EquipmentItem, EquipmentStatusLog


class InvalidTransitionError(Exception):
    """Raised when an invalid status transition is attempted."""

    def __init__(self, from_status: str, to_status: str, detail: str = ""):
        self.from_status = from_status
        self.to_status = to_status
        msg = f"Invalid transition: {from_status} → {to_status}"
        if detail:
            msg += f" ({detail})"
        super().__init__(msg)


class EquipmentStatusService:
    """Single entry point for all equipment status changes.

    Uses SELECT FOR UPDATE for pessimistic locking to ensure atomicity.
    EquipmentStatusLog is the source of truth; current_status is a denormalized cache.
    """

    VALID_TRANSITIONS: dict[str, list[str]] = {
        "pending_receipt": ["available", "out"],
        "available": ["out", "reserved", "lost", "retired", "returned_to_vendor"],
        "reserved": ["available", "out"],
        "out": ["available", "out"],  # out→out for TRANSFER
        "lost": ["available"],
        # retired, returned_to_vendor: terminal
    }

    @classmethod
    def transition(
        cls,
        item: EquipmentItem,
        action: str,
        target_status: str,
        user,
        *,
        schedule=None,
        rental_agreement=None,
        warehouse_transaction=None,
        equipment_transfer=None,
        notes: str = "",
    ) -> EquipmentStatusLog:
        """Perform an atomic status transition with row-level locking."""
        with transaction.atomic():
            locked = EquipmentItem.objects.select_for_update().get(pk=item.pk)
            from_status = locked.current_status

            allowed = cls.VALID_TRANSITIONS.get(from_status, [])
            if target_status not in allowed:
                raise InvalidTransitionError(from_status, target_status)

            locked.current_status = target_status
            locked.save(update_fields=["current_status", "updated_at"])

            log = EquipmentStatusLog.objects.create(
                equipment_item=locked,
                action=action,
                from_status=from_status,
                to_status=target_status,
                schedule=schedule,
                rental_agreement=rental_agreement,
                warehouse_transaction=warehouse_transaction,
                equipment_transfer=equipment_transfer,
                performed_by=user,
                notes=notes,
            )
            return log

    @classmethod
    def transfer(
        cls,
        item: EquipmentItem,
        from_schedule,
        to_schedule,
        transfer,
        user,
        notes: str = "",
    ) -> EquipmentStatusLog:
        """Transfer an item between schedules. Status stays 'out'."""
        with transaction.atomic():
            locked = EquipmentItem.objects.select_for_update().get(pk=item.pk)

            if locked.current_status != "out":
                raise InvalidTransitionError(
                    locked.current_status,
                    "out",
                    "Transfer requires item to be in 'out' status",
                )

            log = EquipmentStatusLog.objects.create(
                equipment_item=locked,
                action=EquipmentStatusLog.Action.TRANSFER,
                from_status="out",
                to_status="out",
                schedule=to_schedule,
                equipment_transfer=transfer,
                performed_by=user,
                notes=notes,
            )
            return log

    @classmethod
    def register(
        cls,
        item: EquipmentItem,
        user,
        *,
        rental_agreement=None,
        notes: str = "",
    ) -> EquipmentStatusLog:
        """Register a new equipment item (initial status log entry)."""
        initial_status = (
            EquipmentItem.Status.PENDING_RECEIPT
            if item.ownership_type == EquipmentItem.OwnershipType.RENTED_IN
            else EquipmentItem.Status.AVAILABLE
        )
        with transaction.atomic():
            locked = EquipmentItem.objects.select_for_update().get(pk=item.pk)
            locked.current_status = initial_status
            locked.save(update_fields=["current_status", "updated_at"])

            log = EquipmentStatusLog.objects.create(
                equipment_item=locked,
                action=EquipmentStatusLog.Action.REGISTER,
                from_status="",
                to_status=initial_status,
                rental_agreement=rental_agreement,
                performed_by=user,
                notes=notes,
            )
            return log
