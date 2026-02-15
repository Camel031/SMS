from rest_framework import serializers

from .models import CustomFieldDefinition


class CustomFieldDefinitionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = CustomFieldDefinition
        fields = [
            "id",
            "name",
            "slug",
            "field_type",
            "entity_type",
            "category",
            "category_name",
            "is_required",
            "default_value",
            "description",
            "placeholder",
            "options",
            "validation_rules",
            "display_order",
            "is_filterable",
            "is_visible_in_list",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        field_type = attrs.get(
            "field_type",
            self.instance.field_type if self.instance else None,
        )
        options = attrs.get(
            "options",
            self.instance.options if self.instance else None,
        )
        if field_type in ("select", "multiselect") and not options:
            raise serializers.ValidationError(
                {"options": "Options are required for select/multiselect fields."}
            )
        return attrs
