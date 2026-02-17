from rest_framework import serializers

from django.db import transaction

from .models import (
    EquipmentCategory,
    EquipmentItem,
    EquipmentModel,
    EquipmentStatusLog,
    EquipmentTemplate,
    EquipmentTemplateItem,
    FaultRecord,
)


# --- Category ---


class EquipmentCategorySerializer(serializers.ModelSerializer):
    full_path = serializers.SerializerMethodField()
    children_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EquipmentCategory
        fields = [
            "id",
            "uuid",
            "name",
            "slug",
            "parent",
            "sort_order",
            "is_active",
            "full_path",
            "children_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "created_at", "updated_at"]

    def get_full_path(self, obj) -> str:
        return obj.get_full_path()


class EquipmentCategoryTreeSerializer(serializers.ModelSerializer):
    """Recursive serializer for category tree."""

    children = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentCategory
        fields = ["id", "uuid", "name", "slug", "sort_order", "is_active", "children"]

    def get_children(self, obj):
        children = obj.children.filter(is_active=True).order_by("sort_order", "name")
        return EquipmentCategoryTreeSerializer(children, many=True).data


# --- Model ---


class EquipmentModelListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    item_count = serializers.IntegerField(read_only=True, default=0)
    available_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EquipmentModel
        fields = [
            "id",
            "uuid",
            "name",
            "brand",
            "model_number",
            "category",
            "category_name",
            "is_numbered",
            "total_quantity",
            "is_active",
            "item_count",
            "available_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "created_at", "updated_at"]


class EquipmentModelDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_path = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True, default=0)
    available_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EquipmentModel
        fields = [
            "id",
            "uuid",
            "name",
            "brand",
            "model_number",
            "description",
            "category",
            "category_name",
            "category_path",
            "is_numbered",
            "total_quantity",
            "image",
            "custom_fields",
            "is_active",
            "item_count",
            "available_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "created_at", "updated_at"]

    def get_category_path(self, obj) -> str:
        return obj.category.get_full_path()


class EquipmentModelCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentModel
        fields = [
            "name",
            "brand",
            "model_number",
            "description",
            "category",
            "is_numbered",
            "total_quantity",
            "image",
            "custom_fields",
            "is_active",
        ]

    def validate(self, attrs):
        is_numbered = attrs.get("is_numbered", self.instance.is_numbered if self.instance else True)
        total_quantity = attrs.get(
            "total_quantity", self.instance.total_quantity if self.instance else 0
        )
        if is_numbered and total_quantity > 0:
            raise serializers.ValidationError(
                {"total_quantity": "Numbered equipment should not set total_quantity. Use EquipmentItem instead."}
            )
        return attrs


# --- Item ---


class EquipmentItemListSerializer(serializers.ModelSerializer):
    model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    model_brand = serializers.CharField(source="equipment_model.brand", read_only=True)
    category_name = serializers.CharField(source="equipment_model.category.name", read_only=True)
    active_fault_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EquipmentItem
        fields = [
            "id",
            "uuid",
            "serial_number",
            "internal_id",
            "equipment_model",
            "model_name",
            "model_brand",
            "category_name",
            "current_status",
            "ownership_type",
            "is_active",
            "active_fault_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "created_at", "updated_at"]


class EquipmentItemDetailSerializer(serializers.ModelSerializer):
    model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    model_brand = serializers.CharField(source="equipment_model.brand", read_only=True)
    category_name = serializers.CharField(source="equipment_model.category.name", read_only=True)
    active_fault_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = EquipmentItem
        fields = [
            "id",
            "uuid",
            "serial_number",
            "internal_id",
            "equipment_model",
            "model_name",
            "model_brand",
            "category_name",
            "ownership_type",
            "rental_agreement",
            "current_status",
            "lamp_hours",
            "purchase_date",
            "warranty_expiry",
            "notes",
            "custom_fields",
            "is_active",
            "active_fault_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "current_status", "created_at", "updated_at"]


class EquipmentItemCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentItem
        fields = [
            "equipment_model",
            "serial_number",
            "internal_id",
            "ownership_type",
            "rental_agreement",
            "lamp_hours",
            "purchase_date",
            "warranty_expiry",
            "notes",
            "custom_fields",
            "is_active",
        ]

    def validate(self, attrs):
        ownership = attrs.get(
            "ownership_type",
            self.instance.ownership_type if self.instance else EquipmentItem.OwnershipType.OWNED,
        )
        rental = attrs.get(
            "rental_agreement",
            self.instance.rental_agreement if self.instance else None,
        )
        if ownership == EquipmentItem.OwnershipType.OWNED and rental is not None:
            raise serializers.ValidationError(
                {"rental_agreement": "Owned equipment cannot have a rental agreement."}
            )
        if ownership == EquipmentItem.OwnershipType.RENTED_IN and rental is None:
            raise serializers.ValidationError(
                {"rental_agreement": "Rented-in equipment must have a rental agreement."}
            )
        model = attrs.get(
            "equipment_model",
            self.instance.equipment_model if self.instance else None,
        )
        if model and not model.is_numbered:
            raise serializers.ValidationError(
                {"equipment_model": "Cannot create individual items for unnumbered equipment."}
            )
        return attrs


# --- Status Log ---


class EquipmentStatusLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(source="performed_by.__str__", read_only=True)

    class Meta:
        model = EquipmentStatusLog
        fields = [
            "id",
            "action",
            "from_status",
            "to_status",
            "schedule",
            "rental_agreement",
            "warehouse_transaction",
            "equipment_transfer",
            "performed_by",
            "performed_by_name",
            "performed_at",
            "notes",
        ]


# --- Fault Record ---


class FaultRecordSerializer(serializers.ModelSerializer):
    equipment_item_display = serializers.CharField(source="equipment_item.__str__", read_only=True)
    reported_by_name = serializers.CharField(source="reported_by.__str__", read_only=True, default=None)
    resolved_by_name = serializers.CharField(source="resolved_by.__str__", read_only=True, default=None)

    class Meta:
        model = FaultRecord
        fields = [
            "id",
            "uuid",
            "equipment_item",
            "equipment_item_display",
            "reported_by",
            "reported_by_name",
            "title",
            "description",
            "severity",
            "is_resolved",
            "resolved_at",
            "resolved_by",
            "resolved_by_name",
            "resolution_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "uuid",
            "is_resolved",
            "resolved_at",
            "resolved_by",
            "created_at",
            "updated_at",
        ]


class FaultRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FaultRecord
        fields = [
            "title",
            "description",
            "severity",
        ]


class FaultResolveSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default="")


# --- Equipment Templates ---


class EquipmentTemplateItemSerializer(serializers.ModelSerializer):
    """Nested serializer for template items. Read returns model info; write accepts model ID + quantity."""

    model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    model_uuid = serializers.UUIDField(source="equipment_model.uuid", read_only=True)
    model_brand = serializers.CharField(source="equipment_model.brand", read_only=True)
    category_name = serializers.CharField(
        source="equipment_model.category.name", read_only=True
    )

    class Meta:
        model = EquipmentTemplateItem
        fields = [
            "id",
            "equipment_model",
            "model_name",
            "model_uuid",
            "model_brand",
            "category_name",
            "quantity",
        ]


class EquipmentTemplateListSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True, default=0)
    created_by_name = serializers.CharField(
        source="created_by.__str__", read_only=True, default=None
    )

    class Meta:
        model = EquipmentTemplate
        fields = [
            "id",
            "uuid",
            "name",
            "description",
            "item_count",
            "created_by",
            "created_by_name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "created_at", "updated_at"]


class EquipmentTemplateDetailSerializer(serializers.ModelSerializer):
    items = EquipmentTemplateItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True, default=0)
    created_by_name = serializers.CharField(
        source="created_by.__str__", read_only=True, default=None
    )

    class Meta:
        model = EquipmentTemplate
        fields = [
            "id",
            "uuid",
            "name",
            "description",
            "items",
            "item_count",
            "created_by",
            "created_by_name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "created_at", "updated_at"]


class EquipmentTemplateCreateUpdateSerializer(serializers.ModelSerializer):
    """Writable serializer with nested items. Replaces all items on update."""

    items = serializers.ListField(
        child=serializers.DictField(), write_only=True
    )

    class Meta:
        model = EquipmentTemplate
        fields = ["name", "description", "is_active", "items"]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        seen_models = set()
        for item in value:
            model_id = item.get("equipment_model")
            quantity = item.get("quantity")
            if not model_id:
                raise serializers.ValidationError("Each item must have an equipment_model.")
            if not quantity or int(quantity) < 1:
                raise serializers.ValidationError("Each item must have a quantity >= 1.")
            if model_id in seen_models:
                raise serializers.ValidationError(
                    f"Duplicate equipment_model: {model_id}"
                )
            seen_models.add(model_id)
            if not EquipmentModel.objects.filter(id=model_id).exists():
                raise serializers.ValidationError(
                    f"Equipment model {model_id} does not exist."
                )
        return value

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        validated_data["created_by"] = self.context["request"].user
        template = EquipmentTemplate.objects.create(**validated_data)
        self._create_items(template, items_data)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            self._create_items(instance, items_data)
        return instance

    def _create_items(self, template, items_data):
        EquipmentTemplateItem.objects.bulk_create([
            EquipmentTemplateItem(
                template=template,
                equipment_model_id=item["equipment_model"],
                quantity=int(item["quantity"]),
            )
            for item in items_data
        ])
