from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.equipment.models import EquipmentModel, EquipmentItem, FaultRecord
from apps.schedules.models import Schedule
from apps.warehouse.models import WarehouseTransaction
from apps.rentals.models import RentalAgreement
from apps.transfers.models import EquipmentTransfer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    # Equipment counts
    total_models = EquipmentModel.objects.filter(is_active=True).count()
    total_items = EquipmentItem.objects.count()
    items_available = EquipmentItem.objects.filter(current_status="available").count()
    items_out = EquipmentItem.objects.filter(current_status="out").count()

    # Schedule counts
    active_schedules = Schedule.objects.filter(
        status__in=["confirmed", "in_progress"]
    ).count()
    draft_schedules = Schedule.objects.filter(status="draft").count()

    # Warehouse
    pending_transactions = WarehouseTransaction.objects.filter(
        status="pending_confirmation"
    ).count()

    # Rentals
    active_rentals = RentalAgreement.objects.filter(
        status__in=["active", "returning"]
    ).count()
    draft_rentals = RentalAgreement.objects.filter(status="draft").count()

    # Transfers
    planned_transfers = EquipmentTransfer.objects.filter(status="planned").count()

    # Faults
    open_faults = FaultRecord.objects.filter(is_resolved=False).count()

    return Response({
        "equipment": {
            "total_models": total_models,
            "total_items": total_items,
            "items_available": items_available,
            "items_out": items_out,
        },
        "schedules": {
            "active": active_schedules,
            "draft": draft_schedules,
        },
        "warehouse": {
            "pending_confirmations": pending_transactions,
        },
        "rentals": {
            "active": active_rentals,
            "draft": draft_rentals,
        },
        "transfers": {
            "planned": planned_transfers,
        },
        "faults": {
            "open": open_faults,
        },
    })
