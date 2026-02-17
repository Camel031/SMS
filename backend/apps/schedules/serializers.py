from django.db.models import Sum
from rest_framework import serializers

from apps.equipment.models import EquipmentItem, EquipmentModel

from .models import CheckoutRecord, Schedule, ScheduleEquipment, ScheduleStatusLog


# ---------------------------------------------------------------------------
# Helper: Minimal user representation
# ---------------------------------------------------------------------------


class UserMinimalSerializer(serializers.Serializer):
    uuid = serializers.UUIDField(read_only=True)
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, user) -> str:
        return f"{user.first_name} {user.last_name}".strip() or user.username


# ---------------------------------------------------------------------------
# ScheduleStatusLog
# ---------------------------------------------------------------------------


class ScheduleStatusLogSerializer(serializers.ModelSerializer):
    changed_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model = ScheduleStatusLog
        fields = [
            "from_status",
            "to_status",
            "changed_by",
            "changed_at",
            "notes",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# CheckoutRecord
# ---------------------------------------------------------------------------


class CheckoutRecordSerializer(serializers.ModelSerializer):
    equipment_item = serializers.SerializerMethodField()
    equipment_model_name = serializers.SerializerMethodField()
    checked_out_by = UserMinimalSerializer(read_only=True)
    checked_in_by = UserMinimalSerializer(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    quantity_still_out = serializers.IntegerField(read_only=True)

    class Meta:
        model = CheckoutRecord
        fields = [
            "id",
            "equipment_item",
            "equipment_model_name",
            "quantity",
            "checked_out_at",
            "checked_out_by",
            "checked_in_at",
            "checked_in_by",
            "quantity_returned",
            "condition_on_return",
            "is_active",
            "quantity_still_out",
        ]
        read_only_fields = fields

    def get_equipment_item(self, obj):
        if obj.equipment_item is None:
            return None
        return {
            "uuid": obj.equipment_item.uuid,
            "serial_number": obj.equipment_item.serial_number,
        }

    def get_equipment_model_name(self, obj) -> str:
        return str(obj.schedule_equipment.equipment_model)


# ---------------------------------------------------------------------------
# ScheduleEquipment (read-only)
# ---------------------------------------------------------------------------


class ScheduleEquipmentSerializer(serializers.ModelSerializer):
    equipment_model = serializers.SerializerMethodField()
    planned_items = serializers.SerializerMethodField()
    quantity_checked_out = serializers.SerializerMethodField()
    quantity_returned = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleEquipment
        fields = [
            "id",
            "equipment_model",
            "quantity_planned",
            "is_over_allocated",
            "over_allocation_note",
            "notes",
            "planned_items",
            "quantity_checked_out",
            "quantity_returned",
        ]
        read_only_fields = fields

    def get_equipment_model(self, obj):
        em = obj.equipment_model
        return {
            "uuid": em.uuid,
            "name": em.name,
            "brand": em.brand,
            "category_name": em.category.name,
            "is_numbered": em.is_numbered,
        }

    def get_planned_items(self, obj):
        return list(
            obj.planned_items.values("uuid", "serial_number")
        )

    def get_quantity_checked_out(self, obj) -> int:
        return (
            obj.checkout_records.aggregate(total=Sum("quantity"))["total"] or 0
        )

    def get_quantity_returned(self, obj) -> int:
        return (
            obj.checkout_records.aggregate(total=Sum("quantity_returned"))[
                "total"
            ]
            or 0
        )


# ---------------------------------------------------------------------------
# ScheduleEquipment (create / update)
# ---------------------------------------------------------------------------


class ScheduleEquipmentCreateUpdateSerializer(serializers.Serializer):
    equipment_model_uuid = serializers.UUIDField(write_only=True)
    quantity_planned = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    over_allocation_note = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    planned_item_uuids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )

    def validate_equipment_model_uuid(self, value):
        try:
            self._equipment_model = EquipmentModel.objects.get(uuid=value)
        except EquipmentModel.DoesNotExist:
            raise serializers.ValidationError(
                "Equipment model with this UUID does not exist."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        equipment_model = getattr(self, "_equipment_model", None)
        if equipment_model is None and self.instance is not None:
            equipment_model = self.instance.equipment_model
        planned_item_uuids = attrs.get("planned_item_uuids", [])

        if planned_item_uuids:
            items = EquipmentItem.objects.filter(uuid__in=planned_item_uuids)
            found_uuids = set(items.values_list("uuid", flat=True))
            missing = set(planned_item_uuids) - found_uuids
            if missing:
                raise serializers.ValidationError(
                    {
                        "planned_item_uuids": (
                            f"The following item UUIDs do not exist: "
                            f"{[str(u) for u in missing]}"
                        )
                    }
                )
            wrong_model = items.exclude(equipment_model=equipment_model)
            if wrong_model.exists():
                raise serializers.ValidationError(
                    {
                        "planned_item_uuids": (
                            "Some items do not belong to the specified equipment model."
                        )
                    }
                )

        attrs["_equipment_model"] = equipment_model
        return attrs


# ---------------------------------------------------------------------------
# Schedule — List
# ---------------------------------------------------------------------------


class ScheduleListSerializer(serializers.ModelSerializer):
    created_by = UserMinimalSerializer(read_only=True)
    equipment_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Schedule
        fields = [
            "uuid",
            "schedule_type",
            "status",
            "title",
            "location",
            "start_datetime",
            "end_datetime",
            "has_conflicts",
            "created_by",
            "equipment_count",
            "is_active",
            "contact_name",
            "notes",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Schedule — Detail
# ---------------------------------------------------------------------------


class ScheduleDetailSerializer(serializers.ModelSerializer):
    created_by = UserMinimalSerializer(read_only=True)
    confirmed_by = UserMinimalSerializer(read_only=True)
    cancelled_by = UserMinimalSerializer(read_only=True)
    dispatch_events = ScheduleListSerializer(many=True, read_only=True)
    equipment_allocations = ScheduleEquipmentSerializer(
        many=True, read_only=True
    )

    class Meta:
        model = Schedule
        fields = [
            "id",
            "uuid",
            "schedule_type",
            "status",
            "title",
            "contact_name",
            "contact_phone",
            "contact_email",
            "start_datetime",
            "end_datetime",
            "expected_return_date",
            "location",
            "notes",
            "created_by",
            "parent",
            "confirmed_at",
            "confirmed_by",
            "started_at",
            "completed_at",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "has_conflicts",
            "is_active",
            "dispatch_events",
            "equipment_allocations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Schedule — Create / Update
# ---------------------------------------------------------------------------


class ScheduleCreateUpdateSerializer(serializers.ModelSerializer):
    parent = serializers.SlugRelatedField(
        slug_field="uuid",
        queryset=Schedule.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Schedule
        fields = [
            "schedule_type",
            "title",
            "contact_name",
            "contact_phone",
            "contact_email",
            "start_datetime",
            "end_datetime",
            "expected_return_date",
            "location",
            "notes",
            "parent",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # schedule_type is required on create, read-only on update
        if self.instance is not None:
            self.fields["schedule_type"].read_only = True

    def validate(self, attrs):
        attrs = super().validate(attrs)

        # Resolve start / end, falling back to existing instance values on update
        start = attrs.get(
            "start_datetime",
            getattr(self.instance, "start_datetime", None),
        )
        end = attrs.get(
            "end_datetime",
            getattr(self.instance, "end_datetime", None),
        )

        if start and end and start >= end:
            raise serializers.ValidationError(
                {"end_datetime": "end_datetime must be after start_datetime."}
            )

        parent = attrs.get(
            "parent",
            getattr(self.instance, "parent", None),
        )

        if parent is not None:
            # Resolve schedule_type: from attrs on create, from instance on update
            schedule_type = attrs.get(
                "schedule_type",
                getattr(self.instance, "schedule_type", None),
            )
            if schedule_type and parent.schedule_type != schedule_type:
                raise serializers.ValidationError(
                    {
                        "parent": (
                            "Parent schedule_type must match. "
                            f"Parent is '{parent.schedule_type}', "
                            f"but this schedule is '{schedule_type}'."
                        )
                    }
                )

            # Child events must fall within parent's time range
            if start and start < parent.start_datetime:
                raise serializers.ValidationError(
                    {
                        "start_datetime": (
                            "Child event start_datetime cannot be before "
                            "parent's start_datetime."
                        )
                    }
                )
            if end and end > parent.end_datetime:
                raise serializers.ValidationError(
                    {
                        "end_datetime": (
                            "Child event end_datetime cannot be after "
                            "parent's end_datetime."
                        )
                    }
                )

        return attrs


# ---------------------------------------------------------------------------
# Action serializers
# ---------------------------------------------------------------------------


class ScheduleConfirmSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ScheduleCompleteSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ScheduleCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    force = serializers.BooleanField(default=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
