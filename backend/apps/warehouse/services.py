from django.db import transaction as db_transaction
from django.utils import timezone

from .models import TransactionLineItem, WarehouseTransaction


class CheckOutService:
    """Handles atomic equipment check-out operations for schedules and
    rental-agreement returns-to-vendor."""

    @staticmethod
    def execute(
        *,
        performed_by,
        schedule=None,
        rental_agreement=None,
        items,
        requires_confirmation=False,
        notes="",
    ):
        """
        Create a CHECK_OUT warehouse transaction and, unless deferred for
        confirmation, apply all side effects atomically.

        ``items`` -- list of dicts::

            [
                {
                    "equipment_item": <EquipmentItem | None>,
                    "equipment_model": <EquipmentModel>,
                    "quantity": 1,
                    "notes": "",
                },
                ...
            ]

        Returns the created ``WarehouseTransaction``.
        """
        with db_transaction.atomic():
            status = (
                WarehouseTransaction.Status.PENDING_CONFIRMATION
                if requires_confirmation
                else WarehouseTransaction.Status.CONFIRMED
            )

            txn = WarehouseTransaction.objects.create(
                transaction_type=WarehouseTransaction.TransactionType.CHECK_OUT,
                status=status,
                schedule=schedule,
                rental_agreement=rental_agreement,
                performed_by=performed_by,
                requires_confirmation=requires_confirmation,
                notes=notes,
            )

            line_items = _create_line_items(txn, items)

            if status == WarehouseTransaction.Status.CONFIRMED:
                _apply_checkout_side_effects(
                    txn, line_items, performed_by, schedule, rental_agreement
                )

            return txn


class CheckInService:
    """Handles atomic equipment check-in operations for schedules and
    rental-agreement receive-from-vendor."""

    @staticmethod
    def execute(
        *,
        performed_by,
        schedule=None,
        rental_agreement=None,
        items,
        requires_confirmation=False,
        notes="",
    ):
        """
        Create a CHECK_IN warehouse transaction and, unless deferred for
        confirmation, apply all side effects atomically.

        ``items`` -- list of dicts::

            [
                {
                    "equipment_item": <EquipmentItem | None>,
                    "equipment_model": <EquipmentModel>,
                    "quantity": 1,
                    "condition_on_return": "",
                    "notes": "",
                },
                ...
            ]

        Returns the created ``WarehouseTransaction``.
        """
        with db_transaction.atomic():
            status = (
                WarehouseTransaction.Status.PENDING_CONFIRMATION
                if requires_confirmation
                else WarehouseTransaction.Status.CONFIRMED
            )

            txn = WarehouseTransaction.objects.create(
                transaction_type=WarehouseTransaction.TransactionType.CHECK_IN,
                status=status,
                schedule=schedule,
                rental_agreement=rental_agreement,
                performed_by=performed_by,
                requires_confirmation=requires_confirmation,
                notes=notes,
            )

            line_items = _create_line_items(txn, items)

            if status == WarehouseTransaction.Status.CONFIRMED:
                _apply_checkin_side_effects(
                    txn, line_items, performed_by, schedule, rental_agreement
                )

            return txn


class ConfirmationService:
    """Dual-person confirmation workflow for pending warehouse transactions."""

    @staticmethod
    def confirm(transaction, confirmed_by, notes=""):
        """
        Confirm a pending transaction.  The confirming user must be
        different from the user who originally performed the transaction.

        Returns the updated ``WarehouseTransaction``.
        """
        if transaction.status != WarehouseTransaction.Status.PENDING_CONFIRMATION:
            raise ValueError(
                f"Transaction is '{transaction.get_status_display()}', "
                f"not pending confirmation."
            )

        if confirmed_by == transaction.performed_by:
            raise ValueError(
                "The confirming user must be different from the user "
                "who performed the transaction."
            )

        with db_transaction.atomic():
            txn = WarehouseTransaction.objects.select_for_update().get(
                pk=transaction.pk
            )

            # Re-validate after acquiring the lock.
            if txn.status != WarehouseTransaction.Status.PENDING_CONFIRMATION:
                raise ValueError(
                    f"Transaction is '{txn.get_status_display()}', "
                    f"not pending confirmation."
                )

            txn.status = WarehouseTransaction.Status.CONFIRMED
            txn.confirmed_by = confirmed_by
            txn.confirmed_at = timezone.now()
            if notes:
                txn.notes = (
                    f"{txn.notes}\n[Confirmation] {notes}".strip()
                    if txn.notes
                    else f"[Confirmation] {notes}"
                )
            txn.save(
                update_fields=[
                    "status",
                    "confirmed_by",
                    "confirmed_at",
                    "notes",
                    "updated_at",
                ]
            )

            line_items = list(txn.line_items.select_related(
                "equipment_item", "equipment_model"
            ))

            if txn.transaction_type == WarehouseTransaction.TransactionType.CHECK_OUT:
                _apply_checkout_side_effects(
                    txn,
                    line_items,
                    txn.performed_by,
                    txn.schedule,
                    txn.rental_agreement,
                )
            else:
                _apply_checkin_side_effects(
                    txn,
                    line_items,
                    txn.performed_by,
                    txn.schedule,
                    txn.rental_agreement,
                )

            return txn

    @staticmethod
    def cancel(transaction, cancelled_by, notes=""):
        """
        Cancel a pending transaction.  No side effects are reversed because
        none were applied yet.

        Returns the updated ``WarehouseTransaction``.
        """
        if transaction.status != WarehouseTransaction.Status.PENDING_CONFIRMATION:
            raise ValueError(
                f"Transaction is '{transaction.get_status_display()}', "
                f"not pending confirmation."
            )

        with db_transaction.atomic():
            txn = WarehouseTransaction.objects.select_for_update().get(
                pk=transaction.pk
            )

            if txn.status != WarehouseTransaction.Status.PENDING_CONFIRMATION:
                raise ValueError(
                    f"Transaction is '{txn.get_status_display()}', "
                    f"not pending confirmation."
                )

            txn.status = WarehouseTransaction.Status.CANCELLED
            if notes:
                txn.notes = (
                    f"{txn.notes}\n[Cancelled] {notes}".strip()
                    if txn.notes
                    else f"[Cancelled] {notes}"
                )
            txn.save(update_fields=["status", "notes", "updated_at"])

            return txn


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _create_line_items(txn, items):
    """Bulk-create ``TransactionLineItem`` rows and return them as a list."""
    line_items = []
    for entry in items:
        li = TransactionLineItem.objects.create(
            transaction=txn,
            equipment_model=entry["equipment_model"],
            equipment_item=entry.get("equipment_item"),
            quantity=entry.get("quantity", 1),
            condition_on_return=entry.get("condition_on_return", ""),
            notes=entry.get("notes", ""),
        )
        line_items.append(li)
    return line_items


def _apply_checkout_side_effects(txn, line_items, user, schedule, rental_agreement):
    """Apply side effects for a confirmed CHECK_OUT transaction."""
    if schedule:
        _checkout_for_schedule(txn, line_items, user, schedule)
    elif rental_agreement:
        _checkout_for_rental(txn, line_items, user, rental_agreement)


def _apply_checkin_side_effects(txn, line_items, user, schedule, rental_agreement):
    """Apply side effects for a confirmed CHECK_IN transaction."""
    if schedule:
        _checkin_for_schedule(txn, line_items, user, schedule)
    elif rental_agreement:
        _checkin_for_rental(txn, line_items, user, rental_agreement)


# -- CHECK_OUT + Schedule ---------------------------------------------------

def _checkout_for_schedule(txn, line_items, user, schedule):
    """Transition items to 'out', create CheckoutRecords, and auto-begin
    the schedule on the first checkout."""
    from apps.equipment.services import EquipmentStatusService
    from apps.schedules.models import CheckoutRecord, ScheduleEquipment
    from apps.schedules.services import (
        InvalidScheduleTransitionError,
        ScheduleStatusService,
    )

    now = timezone.now()

    for li in line_items:
        # Ensure a ScheduleEquipment row exists.
        sched_eq, _created = ScheduleEquipment.objects.get_or_create(
            schedule=schedule,
            equipment_model=li.equipment_model,
            defaults={"quantity_planned": li.quantity},
        )

        if li.equipment_item:
            # Numbered equipment -- transition status and create record.
            EquipmentStatusService.transition(
                li.equipment_item,
                "check_out",
                "out",
                user,
                schedule=schedule,
                warehouse_transaction=txn,
            )
            CheckoutRecord.objects.create(
                schedule_equipment=sched_eq,
                equipment_item=li.equipment_item,
                quantity=1,
                checked_out_at=now,
                checked_out_by=user,
            )
        else:
            # Unnumbered equipment -- quantity-only record.
            CheckoutRecord.objects.create(
                schedule_equipment=sched_eq,
                equipment_item=None,
                quantity=li.quantity,
                checked_out_at=now,
                checked_out_by=user,
            )

    # Auto-transition schedule CONFIRMED -> IN_PROGRESS on first checkout.
    try:
        ScheduleStatusService.begin(schedule, user)
    except InvalidScheduleTransitionError:
        pass  # Already in progress (or another non-applicable state).


# -- CHECK_OUT + RentalAgreement (return to vendor) -------------------------

def _checkout_for_rental(txn, line_items, user, rental_agreement):
    """Transition rented-in items to 'returned_to_vendor', deactivate them,
    and complete the agreement when all items have been returned."""
    from apps.equipment.models import EquipmentItem
    from apps.equipment.services import EquipmentStatusService
    from apps.rentals.models import RentalAgreement

    for li in line_items:
        if li.equipment_item:
            EquipmentStatusService.transition(
                li.equipment_item,
                "check_out",
                "returned_to_vendor",
                user,
                rental_agreement=rental_agreement,
                warehouse_transaction=txn,
            )
            # Deactivate the item -- it has left the warehouse permanently.
            EquipmentItem.objects.filter(pk=li.equipment_item.pk).update(
                is_active=False
            )

    # Check whether every item linked to this agreement has been returned.
    outstanding = EquipmentItem.objects.filter(
        rental_agreement=rental_agreement,
        is_active=True,
    ).exclude(
        current_status=EquipmentItem.Status.RETURNED_TO_VENDOR,
    ).exists()

    if not outstanding:
        rental_agreement.status = RentalAgreement.Status.COMPLETED
        rental_agreement.save(update_fields=["status", "updated_at"])


# -- CHECK_IN + Schedule ----------------------------------------------------

def _checkin_for_schedule(txn, line_items, user, schedule):
    """Transition items back to 'available', close CheckoutRecords, create
    FaultRecords for damaged items, and auto-complete the schedule when all
    equipment has been returned."""
    from apps.equipment.models import FaultRecord
    from apps.equipment.services import EquipmentStatusService
    from apps.schedules.models import CheckoutRecord, ScheduleEquipment
    from apps.schedules.services import (
        InvalidScheduleTransitionError,
        ScheduleStatusService,
    )

    now = timezone.now()

    for li in line_items:
        sched_eq, _created = ScheduleEquipment.objects.get_or_create(
            schedule=schedule,
            equipment_model=li.equipment_model,
            defaults={"quantity_planned": li.quantity},
        )

        condition = li.condition_on_return or ""

        if li.equipment_item:
            # Numbered equipment.
            EquipmentStatusService.transition(
                li.equipment_item,
                "check_in",
                "available",
                user,
                schedule=schedule,
                warehouse_transaction=txn,
            )

            # Close the active checkout record for this item.
            active_record = CheckoutRecord.objects.filter(
                schedule_equipment=sched_eq,
                equipment_item=li.equipment_item,
                checked_in_at__isnull=True,
                transferred_at__isnull=True,
            ).first()

            if active_record:
                active_record.checked_in_at = now
                active_record.checked_in_by = user
                active_record.condition_on_return = condition
                active_record.quantity_returned = 1
                active_record.return_notes = li.notes
                active_record.save(
                    update_fields=[
                        "checked_in_at",
                        "checked_in_by",
                        "condition_on_return",
                        "quantity_returned",
                        "return_notes",
                        "updated_at",
                    ]
                )

            # Automatically report damage.
            if condition == "damaged" and li.equipment_item:
                FaultRecord.objects.create(
                    equipment_item=li.equipment_item,
                    reported_by=user,
                    title=(
                        f"Damage reported on return from "
                        f"{schedule.title}"
                    ),
                    description=(
                        f"Item returned as damaged during check-in for "
                        f"schedule \"{schedule.title}\". "
                        f"Notes: {li.notes or 'N/A'}"
                    ),
                    severity=FaultRecord.Severity.MEDIUM,
                )
        else:
            # Unnumbered equipment.
            active_record = CheckoutRecord.objects.filter(
                schedule_equipment=sched_eq,
                equipment_item__isnull=True,
                checked_in_at__isnull=True,
                transferred_at__isnull=True,
            ).first()

            if active_record:
                active_record.quantity_returned = (
                    active_record.quantity_returned + li.quantity
                )
                active_record.condition_on_return = condition
                active_record.return_notes = li.notes
                # If fully returned, stamp the check-in time.
                if active_record.quantity_still_out <= 0:
                    active_record.checked_in_at = now
                    active_record.checked_in_by = user
                active_record.save(
                    update_fields=[
                        "quantity_returned",
                        "condition_on_return",
                        "return_notes",
                        "checked_in_at",
                        "checked_in_by",
                        "updated_at",
                    ]
                )

    # Auto-complete schedule if everything has been returned.
    all_returned = not CheckoutRecord.objects.filter(
        schedule_equipment__schedule=schedule,
        checked_in_at__isnull=True,
        transferred_at__isnull=True,
    ).exists()

    if all_returned:
        # Refresh to pick up status changes (e.g., auto-begin during checkout).
        schedule.refresh_from_db()
        try:
            ScheduleStatusService.complete(schedule, user)
        except InvalidScheduleTransitionError:
            pass


# -- CHECK_IN + RentalAgreement (receive from vendor) -----------------------

def _checkin_for_rental(txn, line_items, user, rental_agreement):
    """Transition pending-receipt items to 'available'."""
    from apps.equipment.services import EquipmentStatusService

    for li in line_items:
        if li.equipment_item:
            EquipmentStatusService.transition(
                li.equipment_item,
                "check_in",
                "available",
                user,
                rental_agreement=rental_agreement,
                warehouse_transaction=txn,
            )
