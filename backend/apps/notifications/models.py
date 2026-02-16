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


# ── Notification Preferences ─────────────────────────────────────────────


class NotificationEventType(models.TextChoices):
    UPCOMING_EVENT = "upcoming_event", "Upcoming Event"
    EQUIPMENT_DUE_RETURN = "equipment_due_return", "Equipment Due Return"
    REPAIR_COMPLETED = "repair_completed", "Repair Completed"
    PENDING_CONFIRMATION = "pending_confirmation", "Pending Confirmation"
    SCHEDULE_CHANGED = "schedule_changed", "Schedule Changed"
    FAULT_REPORTED = "fault_reported", "Fault Reported"
    RENTAL_EXPIRING = "rental_expiring", "Rental Expiring"
    EQUIPMENT_TRANSFERRED = "equipment_transferred", "Equipment Transferred"
    EQUIPMENT_CONFLICT = "equipment_conflict", "Equipment Conflict"
    SYSTEM = "system", "System"


class NotificationChannel(models.TextChoices):
    IN_APP = "in_app", "In-App"
    EMAIL = "email", "Email"


# Event type metadata for frontend display
EVENT_TYPE_CONFIG: dict[str, dict[str, str]] = {
    "upcoming_event": {"category": "schedule", "description": "Schedules starting within 24 hours"},
    "equipment_due_return": {"category": "warehouse", "description": "Equipment past return date"},
    "repair_completed": {"category": "schedule", "description": "External repair completed"},
    "pending_confirmation": {"category": "warehouse", "description": "Warehouse operations awaiting confirmation"},
    "schedule_changed": {"category": "schedule", "description": "Schedule status changes"},
    "fault_reported": {"category": "equipment", "description": "Equipment faults reported"},
    "rental_expiring": {"category": "rental", "description": "Rental agreements expiring soon"},
    "equipment_transferred": {"category": "transfer", "description": "Equipment transferred between schedules"},
    "equipment_conflict": {"category": "equipment", "description": "Equipment over-allocation detected"},
    "system": {"category": "system", "description": "System announcements"},
}

# Default preferences: in_app all ON, email ON only for critical events
_CRITICAL_EMAIL_EVENTS = frozenset([
    "equipment_due_return", "fault_reported", "equipment_conflict", "system",
])

DEFAULT_PREFERENCES: dict[tuple[str, str], bool] = {}
for _evt in NotificationEventType.values:
    DEFAULT_PREFERENCES[(_evt, "in_app")] = True
    DEFAULT_PREFERENCES[(_evt, "email")] = _evt in _CRITICAL_EMAIL_EVENTS


class UserNotificationPreference(TimestampMixin):
    """User override for a specific event_type × channel combination."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    event_type = models.CharField(
        max_length=30, choices=NotificationEventType.choices
    )
    channel = models.CharField(
        max_length=10, choices=NotificationChannel.choices
    )
    is_enabled = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "event_type", "channel")
        indexes = [
            models.Index(fields=["user", "event_type"]),
        ]

    def __str__(self) -> str:
        state = "ON" if self.is_enabled else "OFF"
        return f"{self.user} | {self.event_type} | {self.channel} = {state}"
