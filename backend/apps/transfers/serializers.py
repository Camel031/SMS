from rest_framework import serializers

from apps.equipment.models import EquipmentItem, EquipmentModel
from apps.schedules.models import Schedule

from .models import EquipmentTransfer, TransferLineItem


# ---------------------------------------------------------------------------
# Helper: Minimal user representation
# ---------------------------------------------------------------------------


class UserMinimalSerializer(serializers.Serializer):
    uuid = serializers.UUIDField(read_only=True)
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, user) -> str:
        return f"{user.first_name} {user.last_name}".strip() or user.username


# ---------------------------------------------------------------------------
# Helper: Minimal schedule representation
# ---------------------------------------------------------------------------


class ScheduleMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Schedule
        fields = ["uuid", "title", "schedule_type", "status"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# TransferLineItem — read-only
# ---------------------------------------------------------------------------


class TransferLineItemSerializer(serializers.ModelSerializer):
    equipment_model = serializers.SerializerMethodField()
    equipment_item = serializers.SerializerMethodField()

    class Meta:
        model = TransferLineItem
        fields = [
            "id",
            "equipment_model",
            "equipment_item",
            "quantity",
            "notes",
        ]
        read_only_fields = fields

    def get_equipment_model(self, obj):
        em = obj.equipment_model
        return {
            "uuid": em.uuid,
            "name": em.name,
            "brand": em.brand,
        }

    def get_equipment_item(self, obj):
        if obj.equipment_item is None:
            return None
        return {
            "uuid": obj.equipment_item.uuid,
            "serial_number": obj.equipment_item.serial_number,
            "current_status": obj.equipment_item.current_status,
        }


# ---------------------------------------------------------------------------
# TransferLineItem — create (write)
# ---------------------------------------------------------------------------


class TransferLineItemCreateSerializer(serializers.Serializer):
    equipment_model_uuid = serializers.UUIDField()
    equipment_item_uuid = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, default=1)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_equipment_model_uuid(self, value):
        try:
            self._equipment_model = EquipmentModel.objects.get(uuid=value)
        except EquipmentModel.DoesNotExist:
            raise serializers.ValidationError(
                "Equipment model with this UUID does not exist."
            )
        return value

    def validate_equipment_item_uuid(self, value):
        if value is None:
            return value
        try:
            self._equipment_item = EquipmentItem.objects.get(uuid=value)
        except EquipmentItem.DoesNotExist:
            raise serializers.ValidationError(
                "Equipment item with this UUID does not exist."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs["_equipment_model"] = self._equipment_model
        attrs["_equipment_item"] = getattr(self, "_equipment_item", None)
        return attrs


# ---------------------------------------------------------------------------
# EquipmentTransfer — list
# ---------------------------------------------------------------------------


class EquipmentTransferListSerializer(serializers.ModelSerializer):
    from_schedule = ScheduleMinimalSerializer(read_only=True)
    to_schedule = ScheduleMinimalSerializer(read_only=True)

    class Meta:
        model = EquipmentTransfer
        fields = [
            "uuid",
            "from_schedule",
            "to_schedule",
            "status",
            "planned_datetime",
            "executed_at",
            "created_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# EquipmentTransfer — detail (with nested line_items)
# ---------------------------------------------------------------------------


class EquipmentTransferDetailSerializer(serializers.ModelSerializer):
    from_schedule = ScheduleMinimalSerializer(read_only=True)
    to_schedule = ScheduleMinimalSerializer(read_only=True)
    performed_by = UserMinimalSerializer(read_only=True)
    confirmed_by = UserMinimalSerializer(read_only=True)
    created_by = UserMinimalSerializer(read_only=True)
    line_items = TransferLineItemSerializer(many=True, read_only=True)

    class Meta:
        model = EquipmentTransfer
        fields = [
            "uuid",
            "from_schedule",
            "to_schedule",
            "status",
            "planned_datetime",
            "executed_at",
            "performed_by",
            "confirmed_by",
            "confirmed_at",
            "created_by",
            "notes",
            "line_items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# EquipmentTransfer — create (write)
# ---------------------------------------------------------------------------


class TransferCreateSerializer(serializers.Serializer):
    from_schedule_uuid = serializers.UUIDField()
    to_schedule_uuid = serializers.UUIDField()
    items = TransferLineItemCreateSerializer(many=True)
    planned_datetime = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_from_schedule_uuid(self, value):
        try:
            self._from_schedule = Schedule.objects.get(uuid=value)
        except Schedule.DoesNotExist:
            raise serializers.ValidationError(
                "Source schedule with this UUID does not exist."
            )
        return value

    def validate_to_schedule_uuid(self, value):
        try:
            self._to_schedule = Schedule.objects.get(uuid=value)
        except Schedule.DoesNotExist:
            raise serializers.ValidationError(
                "Destination schedule with this UUID does not exist."
            )
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError(
                "At least one line item is required."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs["_from_schedule"] = self._from_schedule
        attrs["_to_schedule"] = self._to_schedule
        return attrs


# ---------------------------------------------------------------------------
# Action serializers (execute / confirm / cancel)
# ---------------------------------------------------------------------------


class TransferActionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
