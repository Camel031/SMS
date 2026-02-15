import logging

from django.db import transaction
from django.utils import timezone

from apps.audit.services import AuditService
from apps.notifications.services import NotificationService

logger = logging.getLogger(__name__)


class InvalidRentalOperationError(Exception):
    """Raised when an invalid rental operation is attempted."""

    pass


class RentalService:
    """Service layer for rental agreement lifecycle operations.

    All mutating methods run inside transaction.atomic() and use
    lazy imports to avoid circular dependencies.
    """

    # ------------------------------------------------------------------
    # activate
    # ------------------------------------------------------------------
    @staticmethod
    def activate(agreement, user):
        """
        Activate a DRAFT rental agreement.

        Validates that the agreement is in DRAFT status, then transitions
        it to ACTIVE.

        Returns the updated RentalAgreement.
        """
        from .models import RentalAgreement

        if agreement.status != RentalAgreement.Status.DRAFT:
            raise InvalidRentalOperationError(
                f"Cannot activate agreement in '{agreement.status}' status. "
                f"Only DRAFT agreements can be activated."
            )

        with transaction.atomic():
            locked = RentalAgreement.objects.select_for_update().get(pk=agreement.pk)
            locked.status = RentalAgreement.Status.ACTIVE
            locked.save(update_fields=["status", "updated_at"])

        AuditService.log_rental_action(
            user=user, action="activate", agreement=locked,
        )
        NotificationService.on_rental_status_change(locked, "activated", user)
        return locked

    # ------------------------------------------------------------------
    # receive
    # ------------------------------------------------------------------
    @staticmethod
    def receive(agreement, user, *, item_uuids, deploy_to_schedule=None, notes=""):
        """
        Receive rented-in equipment (physical arrival).

        Phase 2a (deploy_to_schedule is None): receive items into the
        warehouse with status AVAILABLE.

        Phase 2b (deploy_to_schedule is set): receive items and
        immediately deploy them to a schedule with status OUT.

        Returns the created WarehouseTransaction.
        """
        from apps.equipment.models import EquipmentItem, EquipmentStatusLog
        from apps.equipment.services import EquipmentStatusService
        from apps.schedules.models import CheckoutRecord, ScheduleEquipment
        from apps.warehouse.models import TransactionLineItem, WarehouseTransaction

        from .models import RentalAgreement

        # --- validation ---
        if agreement.status != RentalAgreement.Status.ACTIVE:
            raise InvalidRentalOperationError(
                f"Cannot receive equipment for agreement in '{agreement.status}' status. "
                f"Agreement must be ACTIVE."
            )

        if agreement.direction != RentalAgreement.Direction.IN:
            raise InvalidRentalOperationError(
                "Can only receive equipment for rental-IN agreements."
            )

        items = EquipmentItem.objects.filter(
            rental_agreement=agreement, uuid__in=item_uuids
        )

        if items.count() != len(item_uuids):
            raise InvalidRentalOperationError(
                "One or more items do not belong to this agreement."
            )

        non_pending = items.exclude(
            current_status=EquipmentItem.Status.PENDING_RECEIPT
        )
        if non_pending.exists():
            raise InvalidRentalOperationError(
                "All items must have 'pending_receipt' status to be received."
            )

        # --- execute ---
        with transaction.atomic():
            now = timezone.now()

            if deploy_to_schedule is None:
                # Phase 2a — receive to warehouse
                txn = WarehouseTransaction.objects.create(
                    transaction_type=WarehouseTransaction.TransactionType.CHECK_IN,
                    rental_agreement=agreement,
                    performed_by=user,
                    notes=notes,
                )

                for item in items:
                    EquipmentStatusService.transition(
                        item,
                        EquipmentStatusLog.Action.CHECK_IN,
                        EquipmentItem.Status.AVAILABLE,
                        user,
                        rental_agreement=agreement,
                        warehouse_transaction=txn,
                        notes=notes,
                    )
                    TransactionLineItem.objects.create(
                        transaction=txn,
                        equipment_model=item.equipment_model,
                        equipment_item=item,
                        quantity=1,
                        notes=notes,
                    )
            else:
                # Phase 2b — direct deploy to schedule
                txn = WarehouseTransaction.objects.create(
                    transaction_type=WarehouseTransaction.TransactionType.CHECK_OUT,
                    schedule=deploy_to_schedule,
                    performed_by=user,
                    notes=notes,
                )

                for item in items:
                    EquipmentStatusService.transition(
                        item,
                        EquipmentStatusLog.Action.CHECK_OUT,
                        EquipmentItem.Status.OUT,
                        user,
                        schedule=deploy_to_schedule,
                        warehouse_transaction=txn,
                        notes=notes,
                    )
                    TransactionLineItem.objects.create(
                        transaction=txn,
                        equipment_model=item.equipment_model,
                        equipment_item=item,
                        quantity=1,
                        notes=notes,
                    )

                    # Find or create ScheduleEquipment for this model
                    sched_equip, _created = ScheduleEquipment.objects.get_or_create(
                        schedule=deploy_to_schedule,
                        equipment_model=item.equipment_model,
                        defaults={"quantity_planned": 0},
                    )

                    # Create CheckoutRecord
                    CheckoutRecord.objects.create(
                        schedule_equipment=sched_equip,
                        equipment_item=item,
                        quantity=1,
                        checked_out_at=now,
                        checked_out_by=user,
                    )

            return txn

    # ------------------------------------------------------------------
    # return_to_vendor
    # ------------------------------------------------------------------
    @staticmethod
    def return_to_vendor(agreement, user, *, item_uuids, notes=""):
        """
        Return rented-in equipment to the vendor.

        Items must be AVAILABLE (in warehouse). Each item is transitioned
        to RETURNED_TO_VENDOR, deregistered, and deactivated. The
        agreement status is updated to RETURNING or COMPLETED depending
        on whether all rented items have been returned.

        Returns the created WarehouseTransaction.
        """
        from apps.equipment.models import EquipmentItem, EquipmentStatusLog
        from apps.equipment.services import EquipmentStatusService
        from apps.warehouse.models import TransactionLineItem, WarehouseTransaction

        from .models import RentalAgreement

        # --- validation ---
        if agreement.status not in (
            RentalAgreement.Status.ACTIVE,
            RentalAgreement.Status.RETURNING,
        ):
            raise InvalidRentalOperationError(
                f"Cannot return equipment for agreement in '{agreement.status}' status. "
                f"Agreement must be ACTIVE or RETURNING."
            )

        if agreement.direction != RentalAgreement.Direction.IN:
            raise InvalidRentalOperationError(
                "Can only return equipment for rental-IN agreements."
            )

        items = EquipmentItem.objects.filter(
            rental_agreement=agreement, uuid__in=item_uuids
        )

        if items.count() != len(item_uuids):
            raise InvalidRentalOperationError(
                "One or more items do not belong to this agreement."
            )

        non_available = items.exclude(current_status=EquipmentItem.Status.AVAILABLE)
        if non_available.exists():
            raise InvalidRentalOperationError(
                "All items must have 'available' status (in warehouse) to be returned to vendor."
            )

        # --- execute ---
        with transaction.atomic():
            txn = WarehouseTransaction.objects.create(
                transaction_type=WarehouseTransaction.TransactionType.CHECK_OUT,
                rental_agreement=agreement,
                performed_by=user,
                notes=notes,
            )

            for item in items:
                TransactionLineItem.objects.create(
                    transaction=txn,
                    equipment_model=item.equipment_model,
                    equipment_item=item,
                    quantity=1,
                    notes=notes,
                )

                # Transition to returned_to_vendor
                EquipmentStatusService.transition(
                    item,
                    EquipmentStatusLog.Action.CHECK_OUT,
                    EquipmentItem.Status.RETURNED_TO_VENDOR,
                    user,
                    rental_agreement=agreement,
                    warehouse_transaction=txn,
                    notes=notes,
                )

                # Deregister — create log entry directly
                EquipmentStatusLog.objects.create(
                    equipment_item=item,
                    action=EquipmentStatusLog.Action.DEREGISTER,
                    from_status=EquipmentItem.Status.RETURNED_TO_VENDOR,
                    to_status=EquipmentItem.Status.RETURNED_TO_VENDOR,
                    rental_agreement=agreement,
                    warehouse_transaction=txn,
                    performed_by=user,
                    notes=notes or "Deregistered on return to vendor",
                )

                # Deactivate item
                item.refresh_from_db()
                item.is_active = False
                item.save(update_fields=["is_active", "updated_at"])

            # Determine new agreement status
            locked_agreement = RentalAgreement.objects.select_for_update().get(
                pk=agreement.pk
            )
            all_returned = not EquipmentItem.objects.filter(
                rental_agreement=agreement,
                is_active=True,
            ).exclude(
                current_status=EquipmentItem.Status.RETURNED_TO_VENDOR,
            ).exists()

            if all_returned:
                locked_agreement.status = RentalAgreement.Status.COMPLETED
            else:
                locked_agreement.status = RentalAgreement.Status.RETURNING

            locked_agreement.save(update_fields=["status", "updated_at"])

            return txn

    # ------------------------------------------------------------------
    # extend
    # ------------------------------------------------------------------
    @staticmethod
    def extend(agreement, user, *, new_end_date, notes=""):
        """
        Extend a rental agreement's end date.

        Validates the agreement is ACTIVE or RETURNING and that
        new_end_date is strictly after the current end_date.

        Returns the updated RentalAgreement.
        """
        from .models import RentalAgreement

        if agreement.status not in (
            RentalAgreement.Status.ACTIVE,
            RentalAgreement.Status.RETURNING,
        ):
            raise InvalidRentalOperationError(
                f"Cannot extend agreement in '{agreement.status}' status. "
                f"Agreement must be ACTIVE or RETURNING."
            )

        if new_end_date <= agreement.end_date:
            raise InvalidRentalOperationError(
                f"New end date ({new_end_date}) must be after "
                f"current end date ({agreement.end_date})."
            )

        with transaction.atomic():
            locked = RentalAgreement.objects.select_for_update().get(pk=agreement.pk)
            locked.end_date = new_end_date
            locked.save(update_fields=["end_date", "updated_at"])

        AuditService.log_rental_action(
            user=user, action="extend", agreement=locked,
            description=f"Extended agreement {locked.agreement_number} to {new_end_date}",
        )
        return locked

    # ------------------------------------------------------------------
    # cancel
    # ------------------------------------------------------------------
    @staticmethod
    def cancel(agreement, user, notes=""):
        """
        Cancel a rental agreement.

        For DRAFT agreements, all pending_receipt items are deregistered
        and deactivated. For ACTIVE agreements, a warning is logged if
        items are still active.

        Returns the updated RentalAgreement.
        """
        from apps.equipment.models import EquipmentItem, EquipmentStatusLog

        from .models import RentalAgreement

        if agreement.status not in (
            RentalAgreement.Status.DRAFT,
            RentalAgreement.Status.ACTIVE,
        ):
            raise InvalidRentalOperationError(
                f"Cannot cancel agreement in '{agreement.status}' status. "
                f"Only DRAFT or ACTIVE agreements can be cancelled."
            )

        with transaction.atomic():
            locked = RentalAgreement.objects.select_for_update().get(pk=agreement.pk)

            if locked.status == RentalAgreement.Status.DRAFT:
                # Deregister all pending_receipt items
                pending_items = EquipmentItem.objects.filter(
                    rental_agreement=agreement,
                    current_status=EquipmentItem.Status.PENDING_RECEIPT,
                )
                for item in pending_items:
                    EquipmentStatusLog.objects.create(
                        equipment_item=item,
                        action=EquipmentStatusLog.Action.DEREGISTER,
                        from_status=EquipmentItem.Status.PENDING_RECEIPT,
                        to_status=EquipmentItem.Status.RETURNED_TO_VENDOR,
                        rental_agreement=agreement,
                        performed_by=user,
                        notes=notes or "Deregistered on agreement cancellation",
                    )
                    item.current_status = EquipmentItem.Status.RETURNED_TO_VENDOR
                    item.is_active = False
                    item.save(update_fields=[
                        "current_status", "is_active", "updated_at",
                    ])

            elif locked.status == RentalAgreement.Status.ACTIVE:
                active_items_exist = EquipmentItem.objects.filter(
                    rental_agreement=agreement,
                    is_active=True,
                ).exclude(
                    current_status=EquipmentItem.Status.RETURNED_TO_VENDOR,
                ).exists()

                if active_items_exist:
                    logger.warning(
                        "Cancelling ACTIVE agreement %s with items still active.",
                        agreement.agreement_number,
                    )

            locked.status = RentalAgreement.Status.CANCELLED
            locked.save(update_fields=["status", "updated_at"])

        AuditService.log_rental_action(
            user=user, action="cancel", agreement=locked,
        )
        NotificationService.on_rental_status_change(locked, "cancelled", user)
        return locked
