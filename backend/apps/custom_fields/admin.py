from django.contrib import admin

from .models import CustomFieldDefinition


@admin.register(CustomFieldDefinition)
class CustomFieldDefinitionAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "field_type", "entity_type", "category", "is_required", "is_active"]
    list_filter = ["field_type", "entity_type", "is_active", "is_required"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}
