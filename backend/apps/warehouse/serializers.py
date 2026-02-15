from rest_framework import serializers

from apps.equipment.models import EquipmentItem, EquipmentModel
from apps.rentals.models import RentalAgreement
from apps.schedules.models import Schedule

from .models import TransactionLineItem, WarehouseTransaction


# ---------------------------------------------------------------------------
# Helper: Minimal user representation
# ---------------------------------------------------------------------------


class UserMinimalSerializer(serializers.Serializer):
    uuid = serializers.UUIDField(read_only=True)
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, user) -> str:
        return f"{user.first_name} {user.last_name}".strip() or user.username


# ---------------------------------------------------------------------------
# TransactionLineItem — Read
# ---------------------------------------------------------------------------


class TransactionLineItemSerializer(serializers.ModelSerializer):
    """Read-only serializer with nested equipment_model and equipment_item info."""

    equipment_model = serializers.SerializerMethodField()
    equipment_item = serializers.SerializerMethodField()

    class Meta:
        model = TransactionLineItem
        fields = [
            "id",
            "equipment_model",
            "equipment_item",
            "quantity",
            "condition_on_return",
            "notes",
        ]
        read_only_fields = fields

    def get_equipment_model(self, obj):
        em = obj.equipment_model
        return {
            "uuid": em.uuid,
            "name": em.name,
            "brand": em.brand,
            "category_name": em.category.name if em.category else "",
            "is_numbered": em.is_numbered,
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
# TransactionLineItem — Write
# ---------------------------------------------------------------------------


class TransactionLineItemCreateSerializer(serializers.Serializer):
    """Write serializer for line items within a check-out or check-in request."""

    equipment_model_uuid = serializers.UUIDField()
    equipment_item_uuid = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, default=1)
    condition_on_return = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# WarehouseTransaction — List
# ---------------------------------------------------------------------------


class WarehouseTransactionListSerializer(serializers.ModelSerializer):
    """Compact representation for list views."""

    schedule_title = serializers.SerializerMethodField()
    rental_agreement_info = serializers.SerializerMethodField()
    performed_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = WarehouseTransaction
        fields = [
            "uuid",
            "transaction_type",
            "status",
            "schedule_title",
            "rental_agreement_info",
            "performed_by",
            "requires_confirmation",
            "created_at",
        ]
        read_only_fields = fields

    def get_schedule_title(self, obj) -> str | None:
        if obj.schedule is None:
            return None
        return obj.schedule.title

    def get_rental_agreement_info(self, obj) -> dict | None:
        if obj.rental_agreement is None:
            return None
        ra = obj.rental_agreement
        return {
            "uuid": ra.uuid,
            "vendor_name": ra.vendor_name,
            "agreement_number": ra.agreement_number,
            "direction": ra.direction,
        }


# ---------------------------------------------------------------------------
# WarehouseTransaction — Detail
# ---------------------------------------------------------------------------


class WarehouseTransactionDetailSerializer(serializers.ModelSerializer):
    """Full representation with nested line_items."""

    schedule = serializers.SerializerMethodField()
    rental_agreement = serializers.SerializerMethodField()
    performed_by = UserMinimalSerializer(read_only=True)
    confirmed_by = UserMinimalSerializer(read_only=True)
    line_items = TransactionLineItemSerializer(many=True, read_only=True)

    class Meta:
        model = WarehouseTransaction
        fields = [
            "id",
            "uuid",
            "transaction_type",
            "status",
            "schedule",
            "rental_agreement",
            "performed_by",
            "confirmed_by",
            "confirmed_at",
            "requires_confirmation",
            "notes",
            "line_items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_schedule(self, obj) -> dict | None:
        if obj.schedule is None:
            return None
        s = obj.schedule
        return {
            "uuid": s.uuid,
            "title": s.title,
            "schedule_type": s.schedule_type,
            "status": s.status,
        }

    def get_rental_agreement(self, obj) -> dict | None:
        if obj.rental_agreement is None:
            return None
        ra = obj.rental_agreement
        return {
            "uuid": ra.uuid,
            "vendor_name": ra.vendor_name,
            "agreement_number": ra.agreement_number,
            "direction": ra.direction,
        }


# ---------------------------------------------------------------------------
# Check-Out — Write
# ---------------------------------------------------------------------------


class CheckOutCreateSerializer(serializers.Serializer):
    """Write serializer for executing a check-out operation."""

    schedule_uuid = serializers.UUIDField(required=False, allow_null=True)
    rental_agreement_uuid = serializers.UUIDField(required=False, allow_null=True)
    items = TransactionLineItemCreateSerializer(many=True)
    requires_confirmation = serializers.BooleanField(default=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        schedule_uuid = attrs.get("schedule_uuid")
        rental_uuid = attrs.get("rental_agreement_uuid")

        if schedule_uuid and rental_uuid:
            raise serializers.ValidationError(
                "schedule_uuid and rental_agreement_uuid are mutually exclusive."
            )

        return attrs


# ---------------------------------------------------------------------------
# Check-In — Write
# ---------------------------------------------------------------------------


class CheckInCreateSerializer(serializers.Serializer):
    """Write serializer for executing a check-in operation."""

    schedule_uuid = serializers.UUIDField(required=False, allow_null=True)
    rental_agreement_uuid = serializers.UUIDField(required=False, allow_null=True)
    items = TransactionLineItemCreateSerializer(many=True)
    requires_confirmation = serializers.BooleanField(default=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        schedule_uuid = attrs.get("schedule_uuid")
        rental_uuid = attrs.get("rental_agreement_uuid")

        if schedule_uuid and rental_uuid:
            raise serializers.ValidationError(
                "schedule_uuid and rental_agreement_uuid are mutually exclusive."
            )

        return attrs


# ---------------------------------------------------------------------------
# Confirm / Cancel — Write
# ---------------------------------------------------------------------------


class ConfirmSerializer(serializers.Serializer):
    """Write serializer for confirming or cancelling a pending transaction."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")
