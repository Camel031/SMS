import django_filters

from .models import Schedule, ScheduleEquipment


class ScheduleFilter(django_filters.FilterSet):
    type = django_filters.CharFilter(field_name="schedule_type")
    status = django_filters.CharFilter()
    start = django_filters.DateTimeFilter(field_name="start_datetime", lookup_expr="gte")
    end = django_filters.DateTimeFilter(field_name="end_datetime", lookup_expr="lte")
    has_conflicts = django_filters.BooleanFilter()
    parent = django_filters.UUIDFilter(field_name="parent__uuid")
    equipment_item = django_filters.UUIDFilter(method="filter_by_equipment_item")

    class Meta:
        model = Schedule
        fields = []

    def filter_by_equipment_item(self, queryset, name, value):
        """Find schedules related to a specific equipment item.

        Checks both planned_items M2M (planning layer) and
        CheckoutRecord (physical layer) for complete coverage.
        """
        from apps.schedules.models import CheckoutRecord

        planned_ids = set(
            queryset.filter(
                equipment_allocations__planned_items__uuid=value
            ).values_list("id", flat=True)
        )
        checkout_ids = set(
            CheckoutRecord.objects.filter(
                equipment_item__uuid=value
            ).values_list("schedule_equipment__schedule_id", flat=True)
        )
        combined = planned_ids | checkout_ids
        if not combined:
            return queryset.none()
        return queryset.filter(id__in=combined).distinct()


class ScheduleEquipmentFilter(django_filters.FilterSet):
    is_over_allocated = django_filters.BooleanFilter()

    class Meta:
        model = ScheduleEquipment
        fields = ["is_over_allocated"]
