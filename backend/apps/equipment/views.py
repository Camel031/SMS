from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import CanManageEquipment

from .filters import EquipmentItemFilter, EquipmentModelFilter, FaultRecordFilter
from .models import (
    EquipmentCategory,
    EquipmentItem,
    EquipmentModel,
    EquipmentStatusLog,
    EquipmentTemplate,
    FaultRecord,
)
from .serializers import (
    EquipmentCategorySerializer,
    EquipmentCategoryTreeSerializer,
    EquipmentItemBatchCreateSerializer,
    EquipmentItemCreateUpdateSerializer,
    EquipmentItemDetailSerializer,
    EquipmentItemListSerializer,
    EquipmentModelCreateUpdateSerializer,
    EquipmentModelDetailSerializer,
    EquipmentModelListSerializer,
    EquipmentStatusLogSerializer,
    EquipmentTemplateCreateUpdateSerializer,
    EquipmentTemplateDetailSerializer,
    EquipmentTemplateListSerializer,
    FaultRecordCreateSerializer,
    FaultRecordSerializer,
    FaultResolveSerializer,
)
from .services import EquipmentStatusService


# ─── Category ────────────────────────────────────────────────────────


class CategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = EquipmentCategorySerializer
    search_fields = ["name", "slug"]
    ordering_fields = ["name", "sort_order", "created_at"]

    def get_queryset(self):
        qs = EquipmentCategory.objects.annotate(
            children_count=Count("children"),
        )
        parent = self.request.query_params.get("parent")
        if parent == "null":
            qs = qs.filter(parent__isnull=True)
        elif parent:
            qs = qs.filter(parent_id=parent)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EquipmentCategorySerializer
    lookup_field = "uuid"

    def get_queryset(self):
        return EquipmentCategory.objects.annotate(
            children_count=Count("children"),
        )

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


class CategoryTreeView(generics.ListAPIView):
    """Return full category tree (roots with nested children)."""

    serializer_class = EquipmentCategoryTreeSerializer
    pagination_class = None

    def get_queryset(self):
        return EquipmentCategory.objects.filter(
            parent__isnull=True, is_active=True
        ).order_by("sort_order", "name")


# ─── Equipment Model ────────────────────────────────────────────────


class EquipmentModelListCreateView(generics.ListCreateAPIView):
    filterset_class = EquipmentModelFilter
    search_fields = ["name", "brand", "model_number"]
    ordering_fields = ["name", "brand", "category__name", "created_at"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EquipmentModelCreateUpdateSerializer
        return EquipmentModelListSerializer

    def get_queryset(self):
        return EquipmentModel.objects.select_related("category").annotate(
            item_count=Count("items"),
            available_count=Count(
                "items", filter=Q(items__current_status=EquipmentItem.Status.AVAILABLE)
            ),
        )

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


class EquipmentModelDetailView(generics.RetrieveUpdateDestroyAPIView):
    lookup_field = "uuid"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return EquipmentModelCreateUpdateSerializer
        return EquipmentModelDetailSerializer

    def get_queryset(self):
        return EquipmentModel.objects.select_related("category").annotate(
            item_count=Count("items"),
            available_count=Count(
                "items", filter=Q(items__current_status=EquipmentItem.Status.AVAILABLE)
            ),
        )

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


# ─── Equipment Item ──────────────────────────────────────────────────


class EquipmentItemListCreateView(generics.ListCreateAPIView):
    filterset_class = EquipmentItemFilter
    search_fields = ["internal_id", "equipment_model__name", "equipment_model__brand"]
    ordering_fields = ["internal_id", "current_status", "equipment_model__name", "created_at"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EquipmentItemCreateUpdateSerializer
        return EquipmentItemListSerializer

    def get_queryset(self):
        return EquipmentItem.objects.select_related(
            "equipment_model", "equipment_model__category"
        ).annotate(
            active_fault_count=Count(
                "fault_records", filter=Q(fault_records__is_resolved=False)
            ),
        )

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        item = serializer.save()
        EquipmentStatusService.register(item, self.request.user)


class EquipmentItemBatchCreateView(generics.CreateAPIView):
    serializer_class = EquipmentItemBatchCreateSerializer

    def get_permissions(self):
        return [IsAuthenticated(), CanManageEquipment()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        quantity = data["quantity"]
        start_value = int(data["internal_id"])
        generated_ids = [f"{start_value + i:03d}" for i in range(quantity)]
        duplicates = sorted(
            EquipmentItem.objects.filter(
                equipment_model=data["equipment_model"],
                internal_id__in=generated_ids,
            )
            .values_list("internal_id", flat=True)
            .distinct()
        )
        if duplicates:
            return Response(
                {
                    "internal_id": [
                        f"ID range conflicts with existing internal IDs: {', '.join(duplicates)}"
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_items = []
        try:
            with transaction.atomic():
                for generated_id in generated_ids:
                    item = EquipmentItem.objects.create(
                        equipment_model=data["equipment_model"],
                        internal_id=generated_id,
                        ownership_type=data.get("ownership_type", EquipmentItem.OwnershipType.OWNED),
                        rental_agreement=data.get("rental_agreement"),
                        lamp_hours=data.get("lamp_hours", 0),
                        purchase_date=data.get("purchase_date"),
                        warranty_expiry=data.get("warranty_expiry"),
                        notes=data.get("notes", ""),
                        custom_fields=data.get("custom_fields", {}),
                        is_active=data.get("is_active", True),
                    )
                    EquipmentStatusService.register(item, request.user)
                    created_items.append(item)
        except IntegrityError:
            return Response(
                {"detail": "Failed to create items due to a duplicate internal ID."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_data = {
            "count": len(created_items),
            "items": EquipmentItemListSerializer(created_items, many=True).data,
        }
        return Response(response_data, status=status.HTTP_201_CREATED)


class EquipmentItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    lookup_field = "uuid"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return EquipmentItemCreateUpdateSerializer
        return EquipmentItemDetailSerializer

    def get_queryset(self):
        return EquipmentItem.objects.select_related(
            "equipment_model", "equipment_model__category"
        ).annotate(
            active_fault_count=Count(
                "fault_records", filter=Q(fault_records__is_resolved=False)
            ),
        )

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


# ─── Item History ────────────────────────────────────────────────────


class EquipmentItemHistoryView(generics.ListAPIView):
    """Status history for a specific equipment item."""

    serializer_class = EquipmentStatusLogSerializer

    def get_queryset(self):
        return EquipmentStatusLog.objects.filter(
            equipment_item__uuid=self.kwargs["uuid"]
        ).select_related("performed_by")


# ─── Fault Records ──────────────────────────────────────────────────


class FaultRecordListView(generics.ListAPIView):
    serializer_class = FaultRecordSerializer
    filterset_class = FaultRecordFilter
    search_fields = ["title", "description"]
    ordering_fields = ["severity", "created_at", "is_resolved"]

    def get_queryset(self):
        return FaultRecord.objects.select_related(
            "equipment_item",
            "equipment_item__equipment_model",
            "reported_by",
            "resolved_by",
        )


class FaultRecordDetailView(generics.RetrieveUpdateAPIView):
    lookup_field = "uuid"
    search_fields = ["title", "description"]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return FaultRecordSerializer
        return FaultRecordSerializer

    def get_queryset(self):
        return FaultRecord.objects.select_related(
            "equipment_item",
            "equipment_item__equipment_model",
            "reported_by",
            "resolved_by",
        )


class FaultRecordCreateView(generics.CreateAPIView):
    """Report a fault on a specific equipment item (POST /items/{uuid}/fault/)."""

    serializer_class = FaultRecordCreateSerializer

    def perform_create(self, serializer):
        from apps.notifications.services import NotificationService

        item = EquipmentItem.objects.get(uuid=self.kwargs["uuid"])
        fault = serializer.save(
            equipment_item=item,
            reported_by=self.request.user,
        )
        NotificationService.on_fault_reported(fault, self.request.user)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def fault_resolve_view(request, uuid):
    """Mark a fault as resolved."""
    fault = FaultRecord.objects.get(uuid=uuid)
    if fault.is_resolved:
        return Response(
            {"detail": "Fault is already resolved."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    serializer = FaultResolveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    fault.is_resolved = True
    fault.resolved_at = timezone.now()
    fault.resolved_by = request.user
    fault.resolution_notes = serializer.validated_data.get("resolution_notes", "")
    fault.save(update_fields=[
        "is_resolved", "resolved_at", "resolved_by", "resolution_notes", "updated_at",
    ])
    return Response(FaultRecordSerializer(fault).data)


# ─── Inventory ───────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def inventory_summary_view(request):
    """Aggregated inventory summary."""
    numbered = EquipmentItem.objects.filter(is_active=True)
    status_counts = {}
    for s in EquipmentItem.Status.values:
        status_counts[s] = numbered.filter(current_status=s).count()

    total_models = EquipmentModel.objects.filter(is_active=True).count()
    total_items = numbered.count()
    total_faults = FaultRecord.objects.filter(is_resolved=False).count()

    return Response({
        "total_models": total_models,
        "total_items": total_items,
        "total_unresolved_faults": total_faults,
        "by_status": status_counts,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def inventory_by_status_view(request):
    """Inventory grouped by status with model breakdown."""
    target_status = request.query_params.get("status")

    qs = EquipmentModel.objects.filter(is_active=True).annotate(
        item_count=Count("items", filter=Q(items__is_active=True)),
    )

    if target_status:
        qs = qs.annotate(
            status_count=Count(
                "items",
                filter=Q(items__current_status=target_status, items__is_active=True),
            )
        ).filter(status_count__gt=0)
    else:
        qs = qs.filter(item_count__gt=0)

    data = []
    for m in qs.select_related("category"):
        entry = {
            "uuid": str(m.uuid),
            "name": str(m),
            "category": m.category.name,
            "is_numbered": m.is_numbered,
            "total_quantity": m.total_quantity if not m.is_numbered else m.item_count,
        }
        if target_status:
            entry["count"] = m.status_count
        else:
            entry["count"] = m.item_count
        data.append(entry)

    return Response(data)


# ─── Availability ──────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def model_availability_view(request, uuid):
    """Get availability for a specific equipment model in a time range."""
    from django.shortcuts import get_object_or_404
    from django.utils.dateparse import parse_datetime
    from apps.schedules.models import Schedule
    from apps.schedules.services import AvailabilityService

    equipment_model = get_object_or_404(EquipmentModel, uuid=uuid)

    start_str = request.query_params.get("start")
    end_str = request.query_params.get("end")

    if not start_str or not end_str:
        return Response(
            {"detail": "start and end query parameters are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    start = parse_datetime(start_str)
    end = parse_datetime(end_str)
    if not start or not end:
        return Response(
            {"detail": "Invalid datetime format. Use ISO 8601."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    exclude_schedule_uuid = request.query_params.get("exclude_schedule")
    exclude_schedule = None
    if exclude_schedule_uuid:
        exclude_schedule = Schedule.objects.filter(uuid=exclude_schedule_uuid).first()

    availability = AvailabilityService.get_model_availability(
        equipment_model, start, end, exclude_schedule=exclude_schedule
    )
    return Response(availability)


# ─── Equipment Templates ─────────────────────────────────────────────


# ─── Recent Selections ────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recent_selections_view(request):
    """Return the last N unique equipment models selected by this user."""
    from apps.schedules.models import ScheduleEquipment

    limit = min(int(request.query_params.get("limit", 5)), 20)

    recent_model_ids = (
        ScheduleEquipment.objects.filter(schedule__created_by=request.user)
        .order_by("-created_at")
        .values_list("equipment_model_id", flat=True)
    )
    # Deduplicate while preserving recency order
    seen = set()
    unique_ids = []
    for mid in recent_model_ids:
        if mid not in seen:
            seen.add(mid)
            unique_ids.append(mid)
        if len(unique_ids) >= limit:
            break

    if not unique_ids:
        return Response([])

    models_qs = (
        EquipmentModel.objects.filter(id__in=unique_ids)
        .select_related("category")
        .annotate(
            item_count=Count("items"),
            available_count=Count(
                "items",
                filter=Q(items__current_status=EquipmentItem.Status.AVAILABLE),
            ),
        )
    )
    # Restore recency order
    models_by_id = {m.id: m for m in models_qs}
    ordered = [models_by_id[mid] for mid in unique_ids if mid in models_by_id]
    serializer = EquipmentModelListSerializer(ordered, many=True)
    return Response(serializer.data)


# ─── Batch Import ─────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated, CanManageEquipment])
def batch_import_view(request):
    """CSV batch import for equipment items. Use ?confirm=true to execute."""
    from .import_service import BatchImportService

    csv_file = request.FILES.get("file")
    if not csv_file:
        return Response(
            {"detail": "A CSV file is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    confirm = request.query_params.get("confirm", "false").lower() == "true"
    result = BatchImportService.parse_and_validate(csv_file)

    if result["errors"] and confirm:
        return Response(
            {"detail": "Cannot import with validation errors.", "errors": result["errors"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if confirm and result["valid_rows"]:
        import_result = BatchImportService.execute_import(
            result["valid_rows"], request.user
        )
        return Response(import_result, status=status.HTTP_201_CREATED)

    return Response({
        "valid_count": len(result["valid_rows"]),
        "error_count": len(result["errors"]),
        "valid_rows": result["valid_rows"],
        "errors": result["errors"],
    })


# ─── Equipment Templates ─────────────────────────────────────────────


class EquipmentTemplateListCreateView(generics.ListCreateAPIView):
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return EquipmentTemplateCreateUpdateSerializer
        return EquipmentTemplateListSerializer

    def get_queryset(self):
        return EquipmentTemplate.objects.select_related("created_by").annotate(
            item_count=Count("items"),
        ).filter(is_active=True)

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]


class EquipmentTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    lookup_field = "uuid"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return EquipmentTemplateCreateUpdateSerializer
        return EquipmentTemplateDetailSerializer

    def get_queryset(self):
        return EquipmentTemplate.objects.select_related("created_by").annotate(
            item_count=Count("items"),
        ).prefetch_related(
            "items__equipment_model__category",
        )

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsAuthenticated(), CanManageEquipment()]
        return [IsAuthenticated()]
