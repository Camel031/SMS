from django.contrib import admin

from .models import CheckoutRecord, Schedule, ScheduleEquipment, ScheduleStatusLog


class ScheduleEquipmentInline(admin.TabularInline):
    model = ScheduleEquipment
    extra = 0
    readonly_fields = ("is_over_allocated",)


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "schedule_type",
        "status",
        "start_datetime",
        "end_datetime",
        "has_conflicts",
    )
    list_filter = ("schedule_type", "status", "has_conflicts")
    search_fields = ("title", "contact_name", "location")
    readonly_fields = (
        "uuid",
        "confirmed_at",
        "confirmed_by",
        "started_at",
        "completed_at",
        "cancelled_at",
        "cancelled_by",
    )
    inlines = [ScheduleEquipmentInline]


@admin.register(ScheduleEquipment)
class ScheduleEquipmentAdmin(admin.ModelAdmin):
    list_display = (
        "schedule",
        "equipment_model",
        "quantity_planned",
        "is_over_allocated",
    )
    list_filter = ("is_over_allocated",)


@admin.register(CheckoutRecord)
class CheckoutRecordAdmin(admin.ModelAdmin):
    list_display = (
        "schedule_equipment",
        "equipment_item",
        "quantity",
        "checked_out_at",
        "checked_in_at",
    )
    list_filter = ("checked_in_at",)


@admin.register(ScheduleStatusLog)
class ScheduleStatusLogAdmin(admin.ModelAdmin):
    list_display = (
        "schedule",
        "from_status",
        "to_status",
        "changed_by",
        "changed_at",
    )
    readonly_fields = (
        "schedule",
        "from_status",
        "to_status",
        "changed_by",
        "changed_at",
        "notes",
    )
