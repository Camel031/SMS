from django.contrib import admin

from .models import (
    EquipmentCategory,
    EquipmentItem,
    EquipmentModel,
    EquipmentStatusLog,
    FaultRecord,
)


@admin.register(EquipmentCategory)
class EquipmentCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent", "sort_order", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(EquipmentModel)
class EquipmentModelAdmin(admin.ModelAdmin):
    list_display = ["name", "brand", "category", "is_numbered", "total_quantity", "is_active"]
    list_filter = ["is_active", "is_numbered", "category"]
    search_fields = ["name", "brand", "model_number"]


@admin.register(EquipmentItem)
class EquipmentItemAdmin(admin.ModelAdmin):
    list_display = [
        "serial_number",
        "internal_id",
        "equipment_model",
        "current_status",
        "ownership_type",
        "is_active",
    ]
    list_filter = ["current_status", "ownership_type", "is_active"]
    search_fields = ["serial_number", "internal_id"]


@admin.register(EquipmentStatusLog)
class EquipmentStatusLogAdmin(admin.ModelAdmin):
    list_display = ["equipment_item", "action", "from_status", "to_status", "performed_by", "performed_at"]
    list_filter = ["action"]
    readonly_fields = [
        "equipment_item", "action", "from_status", "to_status",
        "schedule", "rental_agreement", "warehouse_transaction",
        "equipment_transfer", "performed_by", "performed_at", "notes",
    ]


@admin.register(FaultRecord)
class FaultRecordAdmin(admin.ModelAdmin):
    list_display = ["title", "equipment_item", "severity", "is_resolved", "reported_by", "created_at"]
    list_filter = ["severity", "is_resolved"]
    search_fields = ["title", "description"]
