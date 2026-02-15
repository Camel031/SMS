from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Organization, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_active"]
    search_fields = ["name"]


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = [
        "username",
        "email",
        "first_name",
        "last_name",
        "is_staff",
        "can_check_in",
        "can_check_out",
    ]
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "SMS Permissions",
            {
                "fields": (
                    "organization",
                    "phone",
                    "is_external",
                    "can_check_in",
                    "can_check_out",
                    "requires_confirmation",
                    "can_manage_equipment",
                    "can_manage_schedules",
                    "can_manage_users",
                    "can_view_reports",
                ),
            },
        ),
    )
