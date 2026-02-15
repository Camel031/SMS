from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class AuditLog(TimestampMixin, UUIDMixin):
    """Immutable audit trail for all significant system actions."""

    class ActionCategory(models.TextChoices):
        EQUIPMENT = "equipment", "Equipment"
        SCHEDULE = "schedule", "Schedule"
        WAREHOUSE = "warehouse", "Warehouse"
        RENTAL = "rental", "Rental"
        TRANSFER = "transfer", "Transfer"
        USER = "user", "User"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
    )
    user_display = models.CharField(
        max_length=255,
        help_text="Denormalized display name at time of action",
    )
    action = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=ActionCategory.choices)
    description = models.TextField()

    # Related entity
    entity_type = models.CharField(max_length=50, blank=True, db_index=True)
    entity_uuid = models.UUIDField(null=True, blank=True, db_index=True)
    entity_display = models.CharField(max_length=255, blank=True)

    # Snapshot of changes (optional JSON)
    changes = models.JSONField(null=True, blank=True)

    # Request metadata
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["category", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["entity_type", "entity_uuid"]),
        ]

    def __str__(self) -> str:
        return f"[{self.category}] {self.action} by {self.user_display}"
