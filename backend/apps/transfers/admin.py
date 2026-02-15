from django.contrib import admin

from .models import EquipmentTransfer, TransferLineItem


class TransferLineItemInline(admin.TabularInline):
    model = TransferLineItem
    extra = 0
    raw_id_fields = ["equipment_model", "equipment_item"]


@admin.register(EquipmentTransfer)
class EquipmentTransferAdmin(admin.ModelAdmin):
    list_display = [
        "uuid",
        "from_schedule",
        "to_schedule",
        "status",
        "planned_datetime",
        "executed_at",
        "performed_by",
        "created_at",
    ]
    list_filter = ["status"]
    search_fields = ["uuid", "notes"]
    raw_id_fields = [
        "from_schedule",
        "to_schedule",
        "performed_by",
        "confirmed_by",
        "created_by",
    ]
    inlines = [TransferLineItemInline]
