from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.models import AuditLog
from apps.equipment.models import EquipmentCategory, EquipmentModel, EquipmentItem, FaultRecord
from apps.rentals.models import RentalAgreement
from apps.schedules.models import CheckoutRecord, Schedule, ScheduleEquipment
from apps.schedules.services import AvailabilityService
from apps.transfers.models import EquipmentTransfer
from apps.warehouse.models import WarehouseTransaction


def _user_display(user):
    """Return display name for a user instance."""
    if user is None:
        return None
    return {
        "uuid": str(user.uuid),
        "full_name": f"{user.first_name} {user.last_name}".strip() or user.username,
    }


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


# ---------------------------------------------------------------------------
# Upcoming Schedules
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_upcoming_schedules(request):
    """GET /dashboard/upcoming-schedules/?days=7

    Returns schedules starting within the next N days,
    with equipment summary and checkout progress.
    """
    days = min(int(request.query_params.get("days", 7)), 30)
    now = timezone.now()
    cutoff = now + timedelta(days=days)

    schedules = (
        Schedule.objects.filter(
            start_datetime__gte=now,
            start_datetime__lte=cutoff,
            status__in=["draft", "confirmed", "in_progress"],
            parent__isnull=True,
        )
        .select_related("created_by")
        .prefetch_related(
            Prefetch(
                "equipment_allocations",
                queryset=ScheduleEquipment.objects.select_related("equipment_model"),
            ),
            "equipment_allocations__checkout_records",
        )
        .order_by("start_datetime")
    )

    results = []
    for s in schedules:
        total_planned = 0
        total_checked_out = 0
        total_returned = 0

        for alloc in s.equipment_allocations.all():
            total_planned += alloc.quantity_planned
            for cr in alloc.checkout_records.all():
                total_checked_out += cr.quantity
                total_returned += cr.quantity_returned

        results.append({
            "uuid": str(s.uuid),
            "title": s.title,
            "schedule_type": s.schedule_type,
            "status": s.status,
            "start_datetime": s.start_datetime.isoformat(),
            "end_datetime": s.end_datetime.isoformat(),
            "location": s.location,
            "has_conflicts": s.has_conflicts,
            "created_by": _user_display(s.created_by),
            "equipment_summary": {
                "total_planned": total_planned,
                "total_checked_out": total_checked_out,
                "total_returned": total_returned,
                "checkout_progress": (
                    round(total_checked_out / total_planned * 100)
                    if total_planned > 0 else 0
                ),
            },
        })

    return Response(results)


# ---------------------------------------------------------------------------
# Attention Items
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_attention_items(request):
    """GET /dashboard/attention-items/

    Returns items requiring attention, sorted by severity.
    """
    now = timezone.now()
    today = now.date()
    items = []

    # 1. Overdue returns: in_progress schedules past end_datetime with active checkouts
    overdue_schedules = Schedule.objects.filter(
        end_datetime__lt=now,
        status="in_progress",
    )
    for s in overdue_schedules:
        active_count = CheckoutRecord.objects.filter(
            schedule_equipment__schedule=s,
            checked_in_at__isnull=True,
            transferred_at__isnull=True,
        ).count()
        if active_count > 0:
            items.append({
                "type": "overdue_return",
                "severity": "critical",
                "title": f"Overdue: {s.title}",
                "description": (
                    f"{active_count} item(s) still checked out, "
                    f"was due {s.end_datetime.strftime('%b %d')}"
                ),
                "entity_type": "schedule",
                "entity_uuid": str(s.uuid),
                "action_url": f"/schedules/{s.uuid}",
                "due_at": s.end_datetime.isoformat(),
                "sort_weight": 100,
            })

    # 2. Unresolved faults (critical + high)
    faults = FaultRecord.objects.filter(
        is_resolved=False,
        severity__in=["critical", "high"],
    ).select_related("equipment_item__equipment_model")
    for f in faults:
        weight = 90 if f.severity == "critical" else 60
        items.append({
            "type": "unresolved_fault",
            "severity": "critical" if f.severity == "critical" else "warning",
            "title": f"Fault: {f.title}",
            "description": (
                f"{f.equipment_item.equipment_model} "
                f"[{f.equipment_item.serial_number}]"
            ),
            "entity_type": "equipment_item",
            "entity_uuid": str(f.equipment_item.uuid),
            "action_url": f"/equipment/items/{f.equipment_item.uuid}",
            "due_at": f.created_at.isoformat(),
            "sort_weight": weight,
        })

    # 3. Expiring rentals (ending within 3 days)
    expiring_rentals = RentalAgreement.objects.filter(
        status__in=["active", "returning"],
        end_date__lte=today + timedelta(days=3),
        end_date__gte=today,
    )
    for r in expiring_rentals:
        items.append({
            "type": "expiring_rental",
            "severity": "warning",
            "title": f"Rental expiring: {r.vendor_name}",
            "description": (
                f"Agreement {r.agreement_number} ends "
                f"{r.end_date.strftime('%b %d')}"
            ),
            "entity_type": "rental_agreement",
            "entity_uuid": str(r.uuid),
            "action_url": f"/rentals/{r.uuid}",
            "due_at": r.end_date.isoformat(),
            "sort_weight": 70,
        })

    # 4. Pending warehouse confirmations
    pending_count = WarehouseTransaction.objects.filter(
        status="pending_confirmation"
    ).count()
    if pending_count > 0:
        items.append({
            "type": "pending_confirmation",
            "severity": "info",
            "title": f"{pending_count} pending confirmation(s)",
            "description": "Warehouse transactions awaiting verification",
            "entity_type": None,
            "entity_uuid": None,
            "action_url": "/warehouse/pending",
            "due_at": None,
            "sort_weight": 40,
        })

    # 5. Unconfirmed schedules starting within 3 days
    soon_drafts = Schedule.objects.filter(
        status="draft",
        start_datetime__lte=now + timedelta(days=3),
        start_datetime__gt=now,
        parent__isnull=True,
    )
    for s in soon_drafts:
        items.append({
            "type": "unconfirmed_upcoming",
            "severity": "warning",
            "title": f"Unconfirmed: {s.title}",
            "description": (
                f"Starts {s.start_datetime.strftime('%b %d %H:%M')} "
                "but still in draft"
            ),
            "entity_type": "schedule",
            "entity_uuid": str(s.uuid),
            "action_url": f"/schedules/{s.uuid}",
            "due_at": s.start_datetime.isoformat(),
            "sort_weight": 30,
        })

    # Sort by weight desc, then by due_at asc
    items.sort(key=lambda x: (-x["sort_weight"], x.get("due_at") or ""))

    return Response(items)


# ---------------------------------------------------------------------------
# Recent Activity
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_recent_activity(request):
    """GET /dashboard/recent-activity/?limit=20

    Returns recent operations from AuditLog.
    """
    limit = min(int(request.query_params.get("limit", 20)), 50)
    logs = AuditLog.objects.order_by("-created_at")[:limit]

    results = [
        {
            "uuid": str(log.uuid),
            "user_display": log.user_display,
            "action": log.action,
            "category": log.category,
            "description": log.description,
            "entity_type": log.entity_type,
            "entity_uuid": str(log.entity_uuid) if log.entity_uuid else None,
            "entity_display": log.entity_display,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

    return Response(results)


# ---------------------------------------------------------------------------
# Timeline Data
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def timeline_data(request):
    """GET /dashboard/timeline/?start=&end=&category=&include_drafts=false

    Returns model-level allocation data for Gantt chart rendering.
    """
    start_param = request.query_params.get("start")
    end_param = request.query_params.get("end")
    category_uuid = request.query_params.get("category")
    include_drafts = request.query_params.get("include_drafts", "false") == "true"

    if not start_param or not end_param:
        return Response(
            {"detail": "start and end query params are required (ISO 8601)."},
            status=400,
        )

    start = parse_datetime(start_param)
    end = parse_datetime(end_param)
    if not start or not end:
        return Response({"detail": "Invalid datetime format."}, status=400)

    # Status filter
    statuses = ["confirmed", "in_progress"]
    if include_drafts:
        statuses.append("draft")

    # Get all ScheduleEquipment for overlapping schedules
    alloc_qs = (
        ScheduleEquipment.objects.filter(
            schedule__start_datetime__lt=end,
            schedule__end_datetime__gt=start,
            schedule__status__in=statuses,
            schedule__parent__isnull=True,
        )
        .select_related(
            "equipment_model",
            "equipment_model__category",
            "schedule",
        )
        .order_by("equipment_model__category__name", "equipment_model__name")
    )

    if category_uuid:
        alloc_qs = alloc_qs.filter(equipment_model__category__uuid=category_uuid)

    # Group by equipment model
    model_map = {}  # uuid -> model info dict
    bars_map = defaultdict(list)  # model_uuid -> [bars]

    for alloc in alloc_qs:
        em = alloc.equipment_model
        model_uuid = str(em.uuid)

        if model_uuid not in model_map:
            avail = AvailabilityService.get_model_availability(em, start, end)
            model_map[model_uuid] = {
                "uuid": model_uuid,
                "name": em.name,
                "brand": em.brand,
                "category_name": em.category.name,
                "is_numbered": em.is_numbered,
                "total_dispatchable": avail["total_dispatchable"],
            }

        s = alloc.schedule
        bars_map[model_uuid].append({
            "schedule_uuid": str(s.uuid),
            "title": s.title,
            "schedule_type": s.schedule_type,
            "status": s.status,
            "start": s.start_datetime.isoformat(),
            "end": s.end_datetime.isoformat(),
            "quantity_planned": alloc.quantity_planned,
            "has_conflict": alloc.is_over_allocated,
            "location": s.location,
        })

    rows = []
    for model_uuid, model_info in model_map.items():
        rows.append({
            "equipment_model": model_info,
            "total_dispatchable": model_info["total_dispatchable"],
            "bars": sorted(bars_map[model_uuid], key=lambda b: b["start"]),
        })

    return Response({
        "rows": rows,
        "range": {
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
    })


# ---------------------------------------------------------------------------
# Timeline Conflicts
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def timeline_conflicts(request):
    """GET /dashboard/timeline/conflicts/?start=&end=

    Returns over-allocated ScheduleEquipment entries in the given range.
    """
    start = parse_datetime(request.query_params.get("start", ""))
    end = parse_datetime(request.query_params.get("end", ""))

    if not start or not end:
        return Response(
            {"detail": "start and end query params are required."},
            status=400,
        )

    conflicting_allocs = ScheduleEquipment.objects.filter(
        is_over_allocated=True,
        schedule__start_datetime__lt=end,
        schedule__end_datetime__gt=start,
        schedule__status__in=["confirmed", "in_progress", "draft"],
    ).select_related("schedule", "equipment_model")

    conflicts = [
        {
            "schedule_uuid": str(alloc.schedule.uuid),
            "schedule_title": alloc.schedule.title,
            "equipment_model_uuid": str(alloc.equipment_model.uuid),
            "equipment_model_name": str(alloc.equipment_model),
            "quantity_planned": alloc.quantity_planned,
            "start": alloc.schedule.start_datetime.isoformat(),
            "end": alloc.schedule.end_datetime.isoformat(),
        }
        for alloc in conflicting_allocs
    ]

    return Response(conflicts)
