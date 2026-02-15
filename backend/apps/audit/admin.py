from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["action", "category", "user_display", "entity_display", "created_at"]
    list_filter = ["category", "action"]
    search_fields = ["description", "user_display", "entity_display"]
    readonly_fields = ["uuid", "created_at", "updated_at"]
    date_hierarchy = "created_at"
