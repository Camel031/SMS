from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class Notification(TimestampMixin, UUIDMixin):
    """In-app notification for system events."""

    class Category(models.TextChoices):
        WAREHOUSE = "warehouse", "Warehouse"
        SCHEDULE = "schedule", "Schedule"
        EQUIPMENT = "equipment", "Equipment"
        RENTAL = "rental", "Rental"
        TRANSFER = "transfer", "Transfer"
        SYSTEM = "system", "System"

    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        ERROR = "error", "Error"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    category = models.CharField(max_length=20, choices=Category.choices)
    severity = models.CharField(
        max_length=10, choices=Severity.choices, default=Severity.INFO
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    # Optional link to related entity
    entity_type = models.CharField(max_length=50, blank=True)
    entity_uuid = models.UUIDField(null=True, blank=True)

    # Actor — who triggered the event
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"[{self.category}] {self.title} → {self.recipient}"
