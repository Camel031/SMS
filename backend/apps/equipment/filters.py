import django_filters

from .models import EquipmentCategory, EquipmentItem, EquipmentModel, FaultRecord


class CategoryDescendantFilterMixin:
    """Expand category filters to include descendant categories."""

    @staticmethod
    def _get_descendant_ids(category: EquipmentCategory) -> list[int]:
        return category.get_descendant_ids(include_self=True)

    def filter_category_by_id(self, queryset, value, *, field_name: str):
        category = EquipmentCategory.objects.filter(id=value).first()
        if category is None:
            return queryset.none()
        descendant_ids = self._get_descendant_ids(category)
        return queryset.filter(**{f"{field_name}__in": descendant_ids})

    def filter_category_by_uuid(self, queryset, value, *, field_name: str):
        category = EquipmentCategory.objects.filter(uuid=value).first()
        if category is None:
            return queryset.none()
        descendant_ids = self._get_descendant_ids(category)
        return queryset.filter(**{f"{field_name}__in": descendant_ids})


class EquipmentModelFilter(CategoryDescendantFilterMixin, django_filters.FilterSet):
    category = django_filters.NumberFilter(method="filter_category")
    category_uuid = django_filters.UUIDFilter(method="filter_category_uuid")
    is_numbered = django_filters.BooleanFilter()
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = EquipmentModel
        fields = ["category", "category_uuid", "is_numbered", "is_active"]

    def filter_category(self, queryset, name, value):
        return self.filter_category_by_id(
            queryset, value, field_name="category_id"
        )

    def filter_category_uuid(self, queryset, name, value):
        return self.filter_category_by_uuid(
            queryset, value, field_name="category_id"
        )


class EquipmentItemFilter(CategoryDescendantFilterMixin, django_filters.FilterSet):
    model = django_filters.NumberFilter(field_name="equipment_model__id")
    model_uuid = django_filters.UUIDFilter(field_name="equipment_model__uuid")
    category = django_filters.NumberFilter(method="filter_category")
    category_uuid = django_filters.UUIDFilter(method="filter_category_uuid")
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

    def filter_category(self, queryset, name, value):
        return self.filter_category_by_id(
            queryset, value, field_name="equipment_model__category_id"
        )

    def filter_category_uuid(self, queryset, name, value):
        return self.filter_category_by_uuid(
            queryset, value, field_name="equipment_model__category_id"
        )


class FaultRecordFilter(django_filters.FilterSet):
    severity = django_filters.ChoiceFilter(choices=FaultRecord.Severity.choices)
    is_resolved = django_filters.BooleanFilter()
    equipment_item = django_filters.NumberFilter(field_name="equipment_item__id")
    equipment_item_uuid = django_filters.UUIDFilter(field_name="equipment_item__uuid")

    class Meta:
        model = FaultRecord
        fields = ["severity", "is_resolved", "equipment_item", "equipment_item_uuid"]
