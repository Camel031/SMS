from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.schedules.models import Schedule

from .models import EquipmentTransfer
from .serializers import (
    EquipmentTransferDetailSerializer,
    EquipmentTransferListSerializer,
    TransferActionSerializer,
    TransferCreateSerializer,
)
from .services import InvalidTransferError, TransferService


# ─── Transfer List / Create ──────────────────────────────────────────


class TransferListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TransferCreateSerializer
        return EquipmentTransferListSerializer

    def get_queryset(self):
        qs = EquipmentTransfer.objects.select_related(
            "from_schedule", "to_schedule"
        )

        # Filter by from_schedule
        from_schedule = self.request.query_params.get("from_schedule")
        if from_schedule:
            qs = qs.filter(from_schedule__uuid=from_schedule)

        # Filter by to_schedule
        to_schedule = self.request.query_params.get("to_schedule")
        if to_schedule:
            qs = qs.filter(to_schedule__uuid=to_schedule)

        # Filter by status
        transfer_status = self.request.query_params.get("status")
        if transfer_status:
            qs = qs.filter(status=transfer_status)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = TransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Build items list for the service
        items = []
        for item_data in data["items"]:
            items.append(
                {
                    "equipment_model": item_data["_equipment_model"],
                    "equipment_item": item_data.get("_equipment_item"),
                    "quantity": item_data.get("quantity", 1),
                    "notes": item_data.get("notes", ""),
                }
            )

        try:
            transfer = TransferService.create(
                from_schedule=data["_from_schedule"],
                to_schedule=data["_to_schedule"],
                items=items,
                performed_by=request.user,
                planned_datetime=data.get("planned_datetime"),
                notes=data.get("notes", ""),
            )
        except InvalidTransferError as e:
            return Response(
                {"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            EquipmentTransferDetailSerializer(transfer).data,
            status=status.HTTP_201_CREATED,
        )


# ─── Transfer Detail ─────────────────────────────────────────────────


class TransferDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentTransferDetailSerializer
    lookup_field = "uuid"

    def get_queryset(self):
        return EquipmentTransfer.objects.select_related(
            "from_schedule",
            "to_schedule",
            "performed_by",
            "confirmed_by",
            "created_by",
        ).prefetch_related(
            "line_items__equipment_model",
            "line_items__equipment_item",
        )


# ─── Execute Transfer ────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_execute_view(request, uuid):
    """Execute a PLANNED transfer."""
    transfer = get_object_or_404(EquipmentTransfer, uuid=uuid)
    serializer = TransferActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notes = serializer.validated_data.get("notes", "")

    try:
        transfer = TransferService.execute(transfer, request.user, notes=notes)
    except InvalidTransferError as e:
        return Response(
            {"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )

    return Response(EquipmentTransferDetailSerializer(transfer).data)


# ─── Confirm Transfer ────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_confirm_view(request, uuid):
    """Confirm a transfer (dual-person verification)."""
    transfer = get_object_or_404(EquipmentTransfer, uuid=uuid)
    serializer = TransferActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notes = serializer.validated_data.get("notes", "")

    try:
        transfer = TransferService.confirm(
            transfer, request.user, notes=notes
        )
    except InvalidTransferError as e:
        return Response(
            {"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )

    return Response(EquipmentTransferDetailSerializer(transfer).data)


# ─── Cancel Transfer ─────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_cancel_view(request, uuid):
    """Cancel a PLANNED transfer."""
    transfer = get_object_or_404(EquipmentTransfer, uuid=uuid)
    serializer = TransferActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notes = serializer.validated_data.get("notes", "")

    try:
        transfer = TransferService.cancel(
            transfer, request.user, notes=notes
        )
    except InvalidTransferError as e:
        return Response(
            {"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )

    return Response(EquipmentTransferDetailSerializer(transfer).data)


# ─── Schedule Transfers ──────────────────────────────────────────────


class ScheduleTransferListView(generics.ListAPIView):
    """List all transfers for a schedule (both incoming and outgoing)."""

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentTransferListSerializer

    def get_queryset(self):
        schedule_uuid = self.kwargs["schedule_uuid"]
        return EquipmentTransfer.objects.filter(
            Q(from_schedule__uuid=schedule_uuid)
            | Q(to_schedule__uuid=schedule_uuid)
        ).select_related("from_schedule", "to_schedule")
