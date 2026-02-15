from django.contrib import admin

from .models import WarehouseTransaction, TransactionLineItem


class TransactionLineItemInline(admin.TabularInline):
    model = TransactionLineItem
    extra = 0
    raw_id_fields = ["equipment_model", "equipment_item"]


@admin.register(WarehouseTransaction)
class WarehouseTransactionAdmin(admin.ModelAdmin):
    list_display = [
        "uuid",
        "transaction_type",
        "status",
        "schedule",
        "rental_agreement",
        "performed_by",
        "confirmed_by",
        "created_at",
    ]
    list_filter = ["transaction_type", "status", "requires_confirmation"]
    search_fields = ["uuid", "notes"]
    raw_id_fields = ["schedule", "rental_agreement", "performed_by", "confirmed_by"]
    inlines = [TransactionLineItemInline]
