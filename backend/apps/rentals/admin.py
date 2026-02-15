from django.contrib import admin

from .models import RentalAgreement, RentalAgreementLine


class RentalAgreementLineInline(admin.TabularInline):
    model = RentalAgreementLine
    extra = 0
    raw_id_fields = ["equipment_model"]


@admin.register(RentalAgreement)
class RentalAgreementAdmin(admin.ModelAdmin):
    list_display = [
        "uuid",
        "direction",
        "status",
        "agreement_number",
        "vendor_name",
        "start_date",
        "end_date",
        "created_by",
    ]
    list_filter = ["direction", "status"]
    search_fields = ["agreement_number", "vendor_name", "vendor_contact"]
    raw_id_fields = ["created_by"]
    inlines = [RentalAgreementLineInline]
