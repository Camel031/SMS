from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.equipment.models import EquipmentItem

from .filters import RentalAgreementFilter
from .models import RentalAgreement, RentalAgreementLine
from .serializers import (
    EquipmentItemMinimalSerializer,
    ExtendSerializer,
    ReceiveSerializer,
    RentalAgreementCreateUpdateSerializer,
    RentalAgreementDetailSerializer,
    RentalAgreementLineCreateSerializer,
    RentalAgreementLineSerializer,
    RentalAgreementListSerializer,
    ReturnToVendorSerializer,
)
from .services import InvalidRentalOperationError, RentalService


# ─── Agreement CRUD ──────────────────────────────────────────────────


class AgreementListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = RentalAgreementFilter
    search_fields = ["agreement_number", "vendor_name", "vendor_contact"]
    ordering_fields = ["agreement_number", "vendor_name", "start_date", "end_date", "created_at"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RentalAgreementCreateUpdateSerializer
        return RentalAgreementListSerializer

    def get_queryset(self):
        return RentalAgreement.objects.annotate(
            line_count=Count("lines", distinct=True),
            equipment_count=Count("equipment_items", distinct=True),
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class AgreementDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "uuid"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return RentalAgreementCreateUpdateSerializer
        return RentalAgreementDetailSerializer

    def get_queryset(self):
        return RentalAgreement.objects.select_related("created_by").prefetch_related(
            "lines__equipment_model__category",
        )

    def destroy(self, request, *args, **kwargs):
        agreement = self.get_object()
        if agreement.status != RentalAgreement.Status.DRAFT:
            return Response(
                {"detail": "Only draft agreements can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


# ─── Agreement Lines ─────────────────────────────────────────────────


class AgreementLineListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == "POST":
            return RentalAgreementLineCreateSerializer
        return RentalAgreementLineSerializer

    def get_agreement(self):
        return get_object_or_404(RentalAgreement, uuid=self.kwargs["uuid"])

    def get_queryset(self):
        return RentalAgreementLine.objects.filter(
            agreement__uuid=self.kwargs["uuid"]
        ).select_related("equipment_model", "equipment_model__category")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        agreement = self.get_agreement()

        if agreement.status != RentalAgreement.Status.DRAFT:
            return Response(
                {"detail": "Lines can only be added to draft agreements."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        equipment_model = data["_equipment_model"]

        try:
            with transaction.atomic():
                line = RentalAgreementLine.objects.create(
                    agreement=agreement,
                    equipment_model=equipment_model,
                    quantity=data["quantity"],
                    notes=data.get("notes", ""),
                )
        except IntegrityError:
            return Response(
                {"detail": "This equipment model is already added to this agreement."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            RentalAgreementLineSerializer(line).data,
            status=status.HTTP_201_CREATED,
        )


class AgreementLineDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "pk"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return RentalAgreementLineCreateSerializer
        return RentalAgreementLineSerializer

    def get_queryset(self):
        return RentalAgreementLine.objects.filter(
            agreement__uuid=self.kwargs["uuid"]
        ).select_related("equipment_model", "equipment_model__category")

    def update(self, request, *args, **kwargs):
        line = self.get_object()

        if line.agreement.status != RentalAgreement.Status.DRAFT:
            return Response(
                {"detail": "Lines can only be modified on draft agreements."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RentalAgreementLineCreateSerializer(
            data=request.data, partial=kwargs.get("partial", False)
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "quantity" in data:
            line.quantity = data["quantity"]
        if "notes" in data:
            line.notes = data["notes"]
        line.save(update_fields=["quantity", "notes", "updated_at"])

        return Response(RentalAgreementLineSerializer(line).data)

    def destroy(self, request, *args, **kwargs):
        line = self.get_object()
        if line.agreement.status != RentalAgreement.Status.DRAFT:
            return Response(
                {"detail": "Lines can only be removed from draft agreements."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


# ─── Lifecycle Actions ───────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agreement_activate_view(request, uuid):
    """DRAFT -> ACTIVE."""
    agreement = get_object_or_404(RentalAgreement, uuid=uuid)
    try:
        agreement = RentalService.activate(agreement, request.user)
    except InvalidRentalOperationError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(RentalAgreementDetailSerializer(agreement).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agreement_receive_view(request, uuid):
    """Receive equipment items for an active rental-in agreement."""
    agreement = get_object_or_404(RentalAgreement, uuid=uuid)
    serializer = ReceiveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        RentalService.receive(
            agreement,
            request.user,
            item_uuids=data["item_uuids"],
            deploy_to_schedule=data.get("_deploy_to_schedule"),
            notes=data.get("notes", ""),
        )
    except InvalidRentalOperationError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    agreement.refresh_from_db()
    return Response(RentalAgreementDetailSerializer(agreement).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agreement_return_view(request, uuid):
    """Return equipment items to the vendor."""
    agreement = get_object_or_404(RentalAgreement, uuid=uuid)
    serializer = ReturnToVendorSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        RentalService.return_to_vendor(
            agreement,
            request.user,
            item_uuids=data["item_uuids"],
            notes=data.get("notes", ""),
        )
    except InvalidRentalOperationError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    agreement.refresh_from_db()
    return Response(RentalAgreementDetailSerializer(agreement).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agreement_extend_view(request, uuid):
    """Extend the end date of a rental agreement."""
    agreement = get_object_or_404(RentalAgreement, uuid=uuid)
    serializer = ExtendSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        agreement = RentalService.extend(
            agreement,
            request.user,
            new_end_date=data["new_end_date"],
        )
    except InvalidRentalOperationError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(RentalAgreementDetailSerializer(agreement).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def agreement_cancel_view(request, uuid):
    """Cancel a rental agreement."""
    agreement = get_object_or_404(RentalAgreement, uuid=uuid)
    notes = request.data.get("notes", "")

    try:
        agreement = RentalService.cancel(agreement, request.user, notes=notes)
    except InvalidRentalOperationError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(RentalAgreementDetailSerializer(agreement).data)


# ─── Agreement Equipment ─────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def agreement_equipment_view(request, uuid):
    """List all equipment items linked to this rental agreement."""
    agreement = get_object_or_404(RentalAgreement, uuid=uuid)
    items = EquipmentItem.objects.filter(
        rental_agreement=agreement,
    ).select_related("equipment_model")
    serializer = EquipmentItemMinimalSerializer(items, many=True)
    return Response(serializer.data)
