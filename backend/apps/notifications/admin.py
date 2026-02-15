from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["title", "recipient", "category", "severity", "is_read", "created_at"]
    list_filter = ["category", "severity", "is_read"]
    search_fields = ["title", "message", "recipient__username"]
    readonly_fields = ["uuid", "created_at", "updated_at"]
    date_hierarchy = "created_at"
