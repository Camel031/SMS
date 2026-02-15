from rest_framework import serializers

from apps.equipment.models import EquipmentItem, EquipmentModel
from apps.schedules.models import Schedule

from .models import RentalAgreement, RentalAgreementLine


# ---------------------------------------------------------------------------
# RentalAgreementLine — read-only
# ---------------------------------------------------------------------------


class RentalAgreementLineSerializer(serializers.ModelSerializer):
    equipment_model_uuid = serializers.UUIDField(
        source="equipment_model.uuid", read_only=True
    )
    equipment_model_name = serializers.SerializerMethodField()
    equipment_model_brand = serializers.CharField(
        source="equipment_model.brand", read_only=True
    )
    category_name = serializers.CharField(
        source="equipment_model.category.name", read_only=True
    )

    class Meta:
        model = RentalAgreementLine
        fields = [
            "id",
            "equipment_model_uuid",
            "equipment_model_name",
            "equipment_model_brand",
            "category_name",
            "quantity",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_equipment_model_name(self, obj) -> str:
        return str(obj.equipment_model)


# ---------------------------------------------------------------------------
# RentalAgreementLine — create / update
# ---------------------------------------------------------------------------


class RentalAgreementLineCreateSerializer(serializers.Serializer):
    equipment_model_uuid = serializers.UUIDField(write_only=True)
    quantity = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_equipment_model_uuid(self, value):
        try:
            self._equipment_model = EquipmentModel.objects.get(uuid=value)
        except EquipmentModel.DoesNotExist:
            raise serializers.ValidationError(
                "Equipment model with this UUID does not exist."
            )
        return value

    def validate(self, attrs):
        attrs["_equipment_model"] = self._equipment_model
        return attrs


# ---------------------------------------------------------------------------
# RentalAgreement — list
# ---------------------------------------------------------------------------


class RentalAgreementListSerializer(serializers.ModelSerializer):
    line_count = serializers.IntegerField(read_only=True, default=0)
    equipment_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RentalAgreement
        fields = [
            "uuid",
            "direction",
            "status",
            "agreement_number",
            "vendor_name",
            "start_date",
            "end_date",
            "line_count",
            "equipment_count",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# RentalAgreement — detail
# ---------------------------------------------------------------------------


class RentalAgreementDetailSerializer(serializers.ModelSerializer):
    lines = RentalAgreementLineSerializer(many=True, read_only=True)
    equipment_summary = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RentalAgreement
        fields = [
            "uuid",
            "direction",
            "status",
            "agreement_number",
            "vendor_name",
            "vendor_contact",
            "vendor_phone",
            "vendor_email",
            "start_date",
            "end_date",
            "notes",
            "created_by",
            "created_by_name",
            "is_active",
            "lines",
            "equipment_summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj) -> str | None:
        if obj.created_by is None:
            return None
        name = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
        return name or obj.created_by.username

    def get_equipment_summary(self, obj) -> dict:
        """Return a summary of equipment items linked to this agreement."""
        items = EquipmentItem.objects.filter(rental_agreement=obj)
        total = items.count()
        by_status = {}
        for item in items.values("current_status"):
            status_val = item["current_status"]
            by_status[status_val] = by_status.get(status_val, 0) + 1
        return {
            "total_items": total,
            "by_status": by_status,
        }


# ---------------------------------------------------------------------------
# RentalAgreement — create / update
# ---------------------------------------------------------------------------


class RentalAgreementCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentalAgreement
        fields = [
            "direction",
            "vendor_name",
            "vendor_contact",
            "vendor_phone",
            "vendor_email",
            "start_date",
            "end_date",
            "notes",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # direction is required on create, read-only on update
        if self.instance is not None:
            self.fields["direction"].read_only = True

    def validate(self, attrs):
        attrs = super().validate(attrs)

        start_date = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )
        end_date = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "end_date must be on or after start_date."}
            )

        return attrs


# ---------------------------------------------------------------------------
# Action serializers
# ---------------------------------------------------------------------------


class ReceiveSerializer(serializers.Serializer):
    item_uuids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
    )
    deploy_to_schedule_uuid = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_deploy_to_schedule_uuid(self, value):
        if value is None:
            return value
        try:
            self._deploy_to_schedule = Schedule.objects.get(uuid=value)
        except Schedule.DoesNotExist:
            raise serializers.ValidationError(
                "Schedule with this UUID does not exist."
            )
        return value

    def validate(self, attrs):
        deploy_to_schedule_uuid = attrs.get("deploy_to_schedule_uuid")
        if deploy_to_schedule_uuid and deploy_to_schedule_uuid is not None:
            attrs["_deploy_to_schedule"] = self._deploy_to_schedule
        else:
            attrs["_deploy_to_schedule"] = None
        return attrs


class ReturnToVendorSerializer(serializers.Serializer):
    item_uuids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ExtendSerializer(serializers.Serializer):
    new_end_date = serializers.DateField()


# ---------------------------------------------------------------------------
# EquipmentItem — minimal (for /equipment/ endpoint)
# ---------------------------------------------------------------------------


class EquipmentItemMinimalSerializer(serializers.ModelSerializer):
    equipment_model_name = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentItem
        fields = [
            "uuid",
            "serial_number",
            "internal_id",
            "current_status",
            "equipment_model_name",
        ]
        read_only_fields = fields

    def get_equipment_model_name(self, obj) -> str:
        return str(obj.equipment_model)
