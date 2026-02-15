from django.db import transaction
from django.utils import timezone


class InvalidTransferError(Exception):
    pass


class TransferService:

    @staticmethod
    def create(
        *,
        from_schedule,
        to_schedule,
        items,
        performed_by,
        planned_datetime=None,
        notes="",
    ):
        """
        Create a transfer between schedules.

        items: list of dicts with keys:
            equipment_item  – EquipmentItem or None
            equipment_model – EquipmentModel (required)
            quantity        – int (default 1)
            notes           – str (default "")

        Returns the created EquipmentTransfer instance.
        """
        from apps.schedules.models import CheckoutRecord, Schedule
        from apps.transfers.models import EquipmentTransfer, TransferLineItem

        # --- validation ---
        if from_schedule.status != Schedule.Status.IN_PROGRESS:
            raise InvalidTransferError(
                "Source schedule must be in IN_PROGRESS status."
            )

        if to_schedule.status not in (
            Schedule.Status.DRAFT,
            Schedule.Status.CONFIRMED,
            Schedule.Status.IN_PROGRESS,
        ):
            raise InvalidTransferError(
                "Destination schedule must be in DRAFT, CONFIRMED, or IN_PROGRESS status."
            )

        if from_schedule.pk == to_schedule.pk:
            raise InvalidTransferError(
                "Source and destination schedules must be different."
            )

        # Validate numbered items have an active checkout in from_schedule
        for item_data in items:
            equipment_item = item_data.get("equipment_item")
            if equipment_item is not None:
                active = CheckoutRecord.objects.filter(
                    schedule_equipment__schedule=from_schedule,
                    schedule_equipment__equipment_model=item_data["equipment_model"],
                    equipment_item=equipment_item,
                    checked_in_at__isnull=True,
                    transferred_at__isnull=True,
                ).exists()
                if not active:
                    raise InvalidTransferError(
                        f"No active checkout found for item {equipment_item} "
                        f"in schedule '{from_schedule}'."
                    )

        # --- create transfer + line items ---
        with transaction.atomic():
            transfer = EquipmentTransfer.objects.create(
                from_schedule=from_schedule,
                to_schedule=to_schedule,
                status=EquipmentTransfer.Status.PLANNED,
                planned_datetime=planned_datetime,
                performed_by=performed_by,
                created_by=performed_by,
                notes=notes,
            )

            for item_data in items:
                TransferLineItem.objects.create(
                    transfer=transfer,
                    equipment_model=item_data["equipment_model"],
                    equipment_item=item_data.get("equipment_item"),
                    quantity=item_data.get("quantity", 1),
                    notes=item_data.get("notes", ""),
                )

        return transfer

    @staticmethod
    def execute(transfer, performed_by, notes=""):
        """
        Execute a PLANNED transfer – move equipment between schedules atomically.

        Returns the updated EquipmentTransfer instance.
        """
        from apps.equipment.services import EquipmentStatusService
        from apps.schedules.models import CheckoutRecord, ScheduleEquipment
        from apps.transfers.models import EquipmentTransfer

        if transfer.status != EquipmentTransfer.Status.PLANNED:
            raise InvalidTransferError(
                "Only PLANNED transfers can be executed."
            )

        now = timezone.now()

        with transaction.atomic():
            for line in transfer.line_items.select_related(
                "equipment_model", "equipment_item"
            ):
                if line.equipment_item is not None:
                    # --- numbered item ---
                    checkout = CheckoutRecord.objects.filter(
                        schedule_equipment__schedule=transfer.from_schedule,
                        schedule_equipment__equipment_model=line.equipment_model,
                        equipment_item=line.equipment_item,
                        checked_in_at__isnull=True,
                        transferred_at__isnull=True,
                    ).select_related("schedule_equipment").first()

                    if checkout is None:
                        raise InvalidTransferError(
                            f"No active checkout for item {line.equipment_item} "
                            f"in source schedule."
                        )

                    # Close the source checkout
                    checkout.transferred_at = now
                    checkout.transfer = transfer
                    checkout.quantity_transferred = 1
                    checkout.save(
                        update_fields=[
                            "transferred_at",
                            "transfer",
                            "quantity_transferred",
                            "updated_at",
                        ]
                    )

                    # Find or create ScheduleEquipment in destination
                    to_se, _ = ScheduleEquipment.objects.get_or_create(
                        schedule=transfer.to_schedule,
                        equipment_model=line.equipment_model,
                        defaults={"quantity_planned": 0},
                    )

                    # Create new checkout in destination
                    CheckoutRecord.objects.create(
                        schedule_equipment=to_se,
                        equipment_item=line.equipment_item,
                        quantity=1,
                        checked_out_at=now,
                        checked_out_by=performed_by,
                    )

                    # Log the status transition
                    EquipmentStatusService.transfer(
                        item=line.equipment_item,
                        from_schedule=transfer.from_schedule,
                        to_schedule=transfer.to_schedule,
                        transfer=transfer,
                        user=performed_by,
                        notes=notes,
                    )

                else:
                    # --- unnumbered item ---
                    checkout = CheckoutRecord.objects.filter(
                        schedule_equipment__schedule=transfer.from_schedule,
                        schedule_equipment__equipment_model=line.equipment_model,
                        equipment_item__isnull=True,
                        checked_in_at__isnull=True,
                        transferred_at__isnull=True,
                    ).select_related("schedule_equipment").first()

                    if checkout is None:
                        raise InvalidTransferError(
                            f"No active checkout for model {line.equipment_model} "
                            f"in source schedule."
                        )

                    # Update transferred quantity on source checkout
                    checkout.quantity_transferred += line.quantity
                    checkout.save(
                        update_fields=["quantity_transferred", "updated_at"]
                    )

                    # Find or create ScheduleEquipment in destination
                    to_se, _ = ScheduleEquipment.objects.get_or_create(
                        schedule=transfer.to_schedule,
                        equipment_model=line.equipment_model,
                        defaults={"quantity_planned": 0},
                    )

                    # Create new checkout in destination
                    CheckoutRecord.objects.create(
                        schedule_equipment=to_se,
                        equipment_item=None,
                        quantity=line.quantity,
                        checked_out_at=now,
                        checked_out_by=performed_by,
                    )

            # Finalise the transfer record
            transfer.status = EquipmentTransfer.Status.CONFIRMED
            transfer.executed_at = now
            transfer.performed_by = performed_by
            if notes:
                transfer.notes = notes
            transfer.save(
                update_fields=[
                    "status",
                    "executed_at",
                    "performed_by",
                    "notes",
                    "updated_at",
                ]
            )

        return transfer

    @staticmethod
    def confirm(transfer, confirmed_by, notes=""):
        """
        Confirm a transfer with dual-person verification then execute it.

        Returns the updated EquipmentTransfer instance.
        """
        from apps.transfers.models import EquipmentTransfer

        if transfer.status != EquipmentTransfer.Status.PLANNED:
            raise InvalidTransferError(
                "Only PLANNED transfers can be confirmed."
            )

        if (
            transfer.performed_by is not None
            and confirmed_by.pk == transfer.performed_by.pk
        ):
            raise InvalidTransferError(
                "Confirmer must be a different person than the performer."
            )

        # Execute all side effects via the shared execute path
        transfer = TransferService.execute(transfer, confirmed_by, notes=notes)

        # Record confirmation metadata
        transfer.confirmed_by = confirmed_by
        transfer.confirmed_at = timezone.now()
        transfer.save(
            update_fields=["confirmed_by", "confirmed_at", "updated_at"]
        )

        return transfer

    @staticmethod
    def cancel(transfer, cancelled_by, notes=""):
        """
        Cancel a PLANNED transfer. No equipment side effects.

        Returns the updated EquipmentTransfer instance.
        """
        from apps.transfers.models import EquipmentTransfer

        if transfer.status != EquipmentTransfer.Status.PLANNED:
            raise InvalidTransferError(
                "Only PLANNED transfers can be cancelled."
            )

        with transaction.atomic():
            transfer.status = EquipmentTransfer.Status.CANCELLED
            if notes:
                transfer.notes = notes
            transfer.save(update_fields=["status", "notes", "updated_at"])

        return transfer
