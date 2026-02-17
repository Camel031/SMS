from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.equipment.models import EquipmentModel

from .filters import ScheduleFilter
from .models import CheckoutRecord, Schedule, ScheduleEquipment, ScheduleStatusLog
from .serializers import (
    CheckoutRecordSerializer,
    ScheduleListSerializer,
    ScheduleDetailSerializer,
    ScheduleCreateUpdateSerializer,
    ScheduleEquipmentSerializer,
    ScheduleEquipmentCreateUpdateSerializer,
    ScheduleConfirmSerializer,
    ScheduleCompleteSerializer,
    ScheduleCancelSerializer,
    ScheduleStatusLogSerializer,
)
from .services import ScheduleStatusService, AvailabilityService, InvalidScheduleTransitionError


# ─── Schedule CRUD ──────────────────────────────────────────────────


class ScheduleListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ScheduleFilter
    search_fields = ["title", "location", "contact_name"]
    ordering_fields = ["start_datetime", "title", "status"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ScheduleCreateUpdateSerializer
        return ScheduleListSerializer

    def get_queryset(self):
        qs = Schedule.objects.select_related(
            "created_by", "parent"
        ).annotate(
            equipment_count=Count("equipment_allocations"),
        )
        # Only show top-level schedules unless ?parent= is provided
        if "parent" not in self.request.query_params:
            qs = qs.filter(parent__isnull=True)
        return qs

    def perform_create(self, serializer):
        schedule = serializer.save(created_by=self.request.user)
        # Create initial status log entry
        ScheduleStatusLog.objects.create(
            schedule=schedule,
            from_status="",
            to_status=schedule.status,
            changed_by=self.request.user,
            notes="Schedule created",
        )


class ScheduleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "uuid"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return ScheduleCreateUpdateSerializer
        return ScheduleDetailSerializer

    def get_queryset(self):
        return Schedule.objects.select_related(
            "created_by", "confirmed_by", "cancelled_by", "parent"
        ).annotate(
            equipment_count=Count("equipment_allocations"),
        )

    def destroy(self, request, *args, **kwargs):
        schedule = self.get_object()
        if schedule.status != Schedule.Status.DRAFT:
            return Response(
                {"detail": "Only draft schedules can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


# ─── Schedule Equipment ─────────────────────────────────────────────


class ScheduleEquipmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ScheduleEquipmentCreateUpdateSerializer
        return ScheduleEquipmentSerializer

    def get_schedule(self):
        return get_object_or_404(Schedule, uuid=self.kwargs["schedule_uuid"])

    def get_queryset(self):
        return ScheduleEquipment.objects.filter(
            schedule__uuid=self.kwargs["schedule_uuid"]
        ).select_related("equipment_model", "equipment_model__category")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        schedule = self.get_schedule()
        equipment_model = data["_equipment_model"]
        planned_item_uuids = data.get("planned_item_uuids", [])

        try:
            with transaction.atomic():
                allocation = ScheduleEquipment.objects.create(
                    schedule=schedule,
                    equipment_model=equipment_model,
                    quantity_planned=data["quantity_planned"],
                    notes=data.get("notes", ""),
                    over_allocation_note=data.get("over_allocation_note", ""),
                )
        except IntegrityError:
            return Response(
                {"detail": "This equipment model is already allocated to this schedule."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if planned_item_uuids:
            from apps.equipment.models import EquipmentItem
            items = EquipmentItem.objects.filter(uuid__in=planned_item_uuids)
            allocation.planned_items.set(items)

        AvailabilityService.check_conflicts(schedule)
        return Response(
            ScheduleEquipmentSerializer(allocation).data,
            status=status.HTTP_201_CREATED,
        )


class ScheduleEquipmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "pk"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return ScheduleEquipmentCreateUpdateSerializer
        return ScheduleEquipmentSerializer

    def get_queryset(self):
        return ScheduleEquipment.objects.filter(
            schedule__uuid=self.kwargs["schedule_uuid"]
        ).select_related("equipment_model", "equipment_model__category")

    def update(self, request, *args, **kwargs):
        allocation = self.get_object()
        serializer = ScheduleEquipmentCreateUpdateSerializer(
            allocation,
            data=request.data,
            partial=kwargs.get("partial", False),
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        allocation.quantity_planned = data.get("quantity_planned", allocation.quantity_planned)
        allocation.notes = data.get("notes", allocation.notes)
        allocation.over_allocation_note = data.get("over_allocation_note", allocation.over_allocation_note)
        allocation.save(update_fields=["quantity_planned", "notes", "over_allocation_note", "updated_at"])

        planned_item_uuids = data.get("planned_item_uuids")
        if planned_item_uuids is not None:
            from apps.equipment.models import EquipmentItem
            items = EquipmentItem.objects.filter(uuid__in=planned_item_uuids)
            allocation.planned_items.set(items)

        AvailabilityService.check_conflicts(allocation.schedule)
        return Response(ScheduleEquipmentSerializer(allocation).data)


# ─── Dispatch Events ────────────────────────────────────────────────


class DispatchEventListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ScheduleCreateUpdateSerializer
        return ScheduleListSerializer

    def get_queryset(self):
        return Schedule.objects.filter(
            parent__uuid=self.kwargs["schedule_uuid"]
        ).select_related("created_by", "parent").annotate(
            equipment_count=Count("equipment_allocations"),
        )

    def perform_create(self, serializer):
        parent = get_object_or_404(Schedule, uuid=self.kwargs["schedule_uuid"])
        schedule = serializer.save(
            created_by=self.request.user,
            parent=parent,
            schedule_type=parent.schedule_type,
        )
        ScheduleStatusLog.objects.create(
            schedule=schedule,
            from_status="",
            to_status=schedule.status,
            changed_by=self.request.user,
            notes="Dispatch event created",
        )


# ─── Status Transition Endpoints ────────────────────────────────────


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def schedule_begin_view(request, uuid):
    """CONFIRMED -> IN_PROGRESS."""
    schedule = get_object_or_404(Schedule, uuid=uuid)
    notes = request.data.get("notes", "")
    try:
        schedule = ScheduleStatusService.begin(schedule, request.user, notes=notes)
    except InvalidScheduleTransitionError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ScheduleDetailSerializer(schedule).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def schedule_confirm_view(request, uuid):
    """DRAFT -> CONFIRMED."""
    schedule = get_object_or_404(Schedule, uuid=uuid)
    serializer = ScheduleConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notes = serializer.validated_data.get("notes", "")
    try:
        schedule = ScheduleStatusService.confirm(schedule, request.user, notes=notes)
    except InvalidScheduleTransitionError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ScheduleDetailSerializer(schedule).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def schedule_complete_view(request, uuid):
    """IN_PROGRESS -> COMPLETED."""
    schedule = get_object_or_404(Schedule, uuid=uuid)
    notes = request.data.get("notes", "")
    try:
        schedule = ScheduleStatusService.complete(schedule, request.user, notes=notes)
    except InvalidScheduleTransitionError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ScheduleDetailSerializer(schedule).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def schedule_cancel_view(request, uuid):
    """ANY (except COMPLETED) -> CANCELLED."""
    schedule = get_object_or_404(Schedule, uuid=uuid)
    serializer = ScheduleCancelSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    reason = serializer.validated_data.get("reason", "")
    force = serializer.validated_data.get("force", False)
    notes = serializer.validated_data.get("notes", "")
    try:
        schedule = ScheduleStatusService.cancel(
            schedule, request.user, reason=reason, force=force, notes=notes
        )
    except InvalidScheduleTransitionError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ScheduleDetailSerializer(schedule).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def schedule_reopen_view(request, uuid):
    """CANCELLED -> DRAFT."""
    schedule = get_object_or_404(Schedule, uuid=uuid)
    notes = request.data.get("notes", "")
    try:
        schedule = ScheduleStatusService.reopen(schedule, request.user, notes=notes)
    except InvalidScheduleTransitionError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ScheduleDetailSerializer(schedule).data)


# ─── Availability ────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def check_availability_view(request):
    """Batch check equipment availability for a time range."""
    start_datetime = request.data.get("start_datetime")
    end_datetime = request.data.get("end_datetime")
    equipment_list = request.data.get("equipment", [])
    exclude_schedule_uuid = request.data.get("exclude_schedule")

    if not start_datetime or not end_datetime:
        return Response(
            {"detail": "start_datetime and end_datetime are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not equipment_list:
        return Response(
            {"detail": "equipment list is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Parse datetimes
    from django.utils.dateparse import parse_datetime
    start = parse_datetime(start_datetime)
    end = parse_datetime(end_datetime)
    if not start or not end:
        return Response(
            {"detail": "Invalid datetime format. Use ISO 8601."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Resolve exclude_schedule
    exclude_schedule = None
    if exclude_schedule_uuid:
        exclude_schedule = Schedule.objects.filter(uuid=exclude_schedule_uuid).first()

    # Build equipment requests
    equipment_requests = []
    for item in equipment_list:
        model_uuid = item.get("equipment_model_uuid")
        quantity = item.get("quantity", 0)
        try:
            model = EquipmentModel.objects.get(uuid=model_uuid)
        except EquipmentModel.DoesNotExist:
            return Response(
                {"detail": f"Equipment model with uuid {model_uuid} not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        equipment_requests.append({
            "equipment_model": model,
            "quantity": quantity,
        })

    results = AvailabilityService.batch_check_availability(
        start, end, equipment_requests, exclude_schedule=exclude_schedule
    )
    return Response(results)


# ─── Checkout Records ──────────────────────────────────────────────


class ScheduleCheckoutRecordListView(generics.ListAPIView):
    """GET /schedules/{schedule_uuid}/checkout-records/

    Returns active checkout records for a schedule (items still out).
    """

    serializer_class = CheckoutRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        schedule_uuid = self.kwargs["schedule_uuid"]
        return (
            CheckoutRecord.objects.filter(
                schedule_equipment__schedule__uuid=schedule_uuid,
                checked_in_at__isnull=True,
                transferred_at__isnull=True,
            )
            .select_related(
                "schedule_equipment__equipment_model",
                "equipment_item",
                "checked_out_by",
                "checked_in_by",
            )
            .order_by("-checked_out_at")
        )
