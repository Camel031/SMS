import django_filters

from .models import Schedule, ScheduleEquipment


class ScheduleFilter(django_filters.FilterSet):
    type = django_filters.CharFilter(field_name="schedule_type")
    status = django_filters.CharFilter()
    start = django_filters.DateTimeFilter(field_name="start_datetime", lookup_expr="gte")
    end = django_filters.DateTimeFilter(field_name="end_datetime", lookup_expr="lte")
    has_conflicts = django_filters.BooleanFilter()
    parent = django_filters.UUIDFilter(field_name="parent__uuid")

    class Meta:
        model = Schedule
        fields = []


class ScheduleEquipmentFilter(django_filters.FilterSet):
    is_over_allocated = django_filters.BooleanFilter()

    class Meta:
        model = ScheduleEquipment
        fields = ["is_over_allocated"]
