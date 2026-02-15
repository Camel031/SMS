import django_filters

from .models import EquipmentItem, EquipmentModel, FaultRecord


class EquipmentModelFilter(django_filters.FilterSet):
    category = django_filters.NumberFilter(field_name="category__id")
    category_uuid = django_filters.UUIDFilter(field_name="category__uuid")
    is_numbered = django_filters.BooleanFilter()
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = EquipmentModel
        fields = ["category", "category_uuid", "is_numbered", "is_active"]


class EquipmentItemFilter(django_filters.FilterSet):
    model = django_filters.NumberFilter(field_name="equipment_model__id")
    model_uuid = django_filters.UUIDFilter(field_name="equipment_model__uuid")
    category = django_filters.NumberFilter(field_name="equipment_model__category__id")
    category_uuid = django_filters.UUIDFilter(field_name="equipment_model__category__uuid")
    status = django_filters.ChoiceFilter(
        field_name="current_status", choices=EquipmentItem.Status.choices
    )
    ownership_type = django_filters.ChoiceFilter(choices=EquipmentItem.OwnershipType.choices)
    is_active = django_filters.BooleanFilter()
    has_faults = django_filters.BooleanFilter(method="filter_has_faults")

    class Meta:
        model = EquipmentItem
        fields = [
            "model",
            "model_uuid",
            "category",
            "category_uuid",
            "status",
            "ownership_type",
            "is_active",
            "has_faults",
        ]

    def filter_has_faults(self, queryset, name, value):
        if value:
            return queryset.filter(active_fault_count__gt=0)
        return queryset.filter(active_fault_count=0)


class FaultRecordFilter(django_filters.FilterSet):
    severity = django_filters.ChoiceFilter(choices=FaultRecord.Severity.choices)
    is_resolved = django_filters.BooleanFilter()
    equipment_item = django_filters.NumberFilter(field_name="equipment_item__id")
    equipment_item_uuid = django_filters.UUIDFilter(field_name="equipment_item__uuid")

    class Meta:
        model = FaultRecord
        fields = ["severity", "is_resolved", "equipment_item", "equipment_item_uuid"]
