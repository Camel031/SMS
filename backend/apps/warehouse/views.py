from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.equipment.models import EquipmentItem, EquipmentModel
from apps.rentals.models import RentalAgreement
from apps.schedules.models import Schedule

from .models import WarehouseTransaction
from .serializers import (
    CheckInCreateSerializer,
    CheckOutCreateSerializer,
    ConfirmSerializer,
    WarehouseTransactionDetailSerializer,
    WarehouseTransactionListSerializer,
)
from .services import CheckInService, CheckOutService, ConfirmationService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_items(raw_items):
    """Resolve UUIDs in raw line-item dicts to actual model instances.

    Returns a list of dicts ready for ``CheckOutService.execute`` /
    ``CheckInService.execute``.

    Raises ``serializers.ValidationError`` when a UUID cannot be found.
    """
    from rest_framework import serializers

    resolved = []
    for idx, entry in enumerate(raw_items):
        # Equipment model (required)
        try:
            equipment_model = EquipmentModel.objects.get(
                uuid=entry["equipment_model_uuid"]
            )
        except EquipmentModel.DoesNotExist:
            raise serializers.ValidationError(
                {
                    "items": {
                        idx: {
                            "equipment_model_uuid": (
                                "Equipment model with this UUID does not exist."
                            )
                        }
                    }
                }
            )

        # Equipment item (optional)
        equipment_item = None
        item_uuid = entry.get("equipment_item_uuid")
        if item_uuid:
            try:
                equipment_item = EquipmentItem.objects.get(uuid=item_uuid)
            except EquipmentItem.DoesNotExist:
                raise serializers.ValidationError(
                    {
                        "items": {
                            idx: {
                                "equipment_item_uuid": (
                                    "Equipment item with this UUID does not exist."
                                )
                            }
                        }
                    }
                )

        resolved.append(
            {
                "equipment_model": equipment_model,
                "equipment_item": equipment_item,
                "quantity": entry.get("quantity", 1),
                "condition_on_return": entry.get("condition_on_return", ""),
                "notes": entry.get("notes", ""),
            }
        )
    return resolved


def _resolve_schedule_and_rental(validated_data):
    """Resolve optional schedule_uuid / rental_agreement_uuid to instances.

    Returns ``(schedule, rental_agreement)`` tuple.
    """
    schedule = None
    rental_agreement = None

    schedule_uuid = validated_data.get("schedule_uuid")
    if schedule_uuid:
        schedule = get_object_or_404(Schedule, uuid=schedule_uuid)

    rental_uuid = validated_data.get("rental_agreement_uuid")
    if rental_uuid:
        rental_agreement = get_object_or_404(
            RentalAgreement, uuid=rental_uuid
        )

    return schedule, rental_agreement


def _transaction_detail_response(txn, http_status=status.HTTP_201_CREATED):
    """Reload the transaction with all relations and return a Response."""
    txn = (
        WarehouseTransaction.objects.select_related(
            "schedule",
            "rental_agreement",
            "performed_by",
            "confirmed_by",
        )
        .prefetch_related(
            "line_items__equipment_model__category",
            "line_items__equipment_item",
        )
        .get(pk=txn.pk)
    )
    return Response(
        WarehouseTransactionDetailSerializer(txn).data,
        status=http_status,
    )


# ---------------------------------------------------------------------------
# Check-Out
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def check_out_view(request):
    """Execute a warehouse check-out operation."""
    serializer = CheckOutCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    schedule, rental_agreement = _resolve_schedule_and_rental(data)
    items = _resolve_items(data["items"])

    try:
        txn = CheckOutService.execute(
            performed_by=request.user,
            schedule=schedule,
            rental_agreement=rental_agreement,
            items=items,
            requires_confirmation=data.get("requires_confirmation", False),
            notes=data.get("notes", ""),
        )
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return _transaction_detail_response(txn)


# ---------------------------------------------------------------------------
# Check-In
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def check_in_view(request):
    """Execute a warehouse check-in operation."""
    serializer = CheckInCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    schedule, rental_agreement = _resolve_schedule_and_rental(data)
    items = _resolve_items(data["items"])

    try:
        txn = CheckInService.execute(
            performed_by=request.user,
            schedule=schedule,
            rental_agreement=rental_agreement,
            items=items,
            requires_confirmation=data.get("requires_confirmation", False),
            notes=data.get("notes", ""),
        )
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return _transaction_detail_response(txn)


# ---------------------------------------------------------------------------
# Transaction List
# ---------------------------------------------------------------------------


class TransactionListView(generics.ListAPIView):
    """List all warehouse transactions (filterable by query params)."""

    serializer_class = WarehouseTransactionListSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["notes", "schedule__title", "rental_agreement__vendor_name"]
    ordering_fields = ["created_at", "transaction_type", "status"]

    def get_queryset(self):
        qs = WarehouseTransaction.objects.select_related(
            "schedule",
            "rental_agreement",
            "performed_by",
        )

        # Optional filters via query params
        transaction_type = self.request.query_params.get("transaction_type")
        if transaction_type:
            qs = qs.filter(transaction_type=transaction_type)

        txn_status = self.request.query_params.get("status")
        if txn_status:
            qs = qs.filter(status=txn_status)

        schedule_uuid = self.request.query_params.get("schedule")
        if schedule_uuid:
            qs = qs.filter(schedule__uuid=schedule_uuid)

        rental_uuid = self.request.query_params.get("rental_agreement")
        if rental_uuid:
            qs = qs.filter(rental_agreement__uuid=rental_uuid)

        return qs


# ---------------------------------------------------------------------------
# Transaction Detail
# ---------------------------------------------------------------------------


class TransactionDetailView(generics.RetrieveAPIView):
    """Retrieve a single warehouse transaction with nested line items."""

    serializer_class = WarehouseTransactionDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "uuid"

    def get_queryset(self):
        return WarehouseTransaction.objects.select_related(
            "schedule",
            "rental_agreement",
            "performed_by",
            "confirmed_by",
        ).prefetch_related(
            "line_items__equipment_model__category",
            "line_items__equipment_item",
        )


# ---------------------------------------------------------------------------
# Confirm / Cancel
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transaction_confirm_view(request, uuid):
    """Confirm a pending warehouse transaction."""
    txn = get_object_or_404(WarehouseTransaction, uuid=uuid)
    serializer = ConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notes = serializer.validated_data.get("notes", "")

    try:
        txn = ConfirmationService.confirm(txn, confirmed_by=request.user, notes=notes)
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return _transaction_detail_response(txn, http_status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transaction_cancel_view(request, uuid):
    """Cancel a pending warehouse transaction."""
    txn = get_object_or_404(WarehouseTransaction, uuid=uuid)
    serializer = ConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notes = serializer.validated_data.get("notes", "")

    try:
        txn = ConfirmationService.cancel(txn, cancelled_by=request.user, notes=notes)
    except ValueError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return _transaction_detail_response(txn, http_status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Pending Confirmations
# ---------------------------------------------------------------------------


class PendingConfirmationListView(generics.ListAPIView):
    """List transactions that are pending confirmation."""

    serializer_class = WarehouseTransactionListSerializer
    permission_classes = [IsAuthenticated]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return WarehouseTransaction.objects.filter(
            status=WarehouseTransaction.Status.PENDING_CONFIRMATION,
        ).select_related(
            "schedule",
            "rental_agreement",
            "performed_by",
        )
