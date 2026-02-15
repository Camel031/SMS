from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class Schedule(TimestampMixin, UUIDMixin):
    class ScheduleType(models.TextChoices):
        EVENT = "event", "Event"
        EXTERNAL_REPAIR = "external_repair", "External Repair"
        RENTAL_OUT = "rental_out", "Rental Out"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    schedule_type = models.CharField(max_length=20, choices=ScheduleType.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    title = models.CharField(max_length=255)
    contact_name = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_email = models.EmailField(blank=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    expected_return_date = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_schedules",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="dispatch_events",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_schedules",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-start_datetime"]

    def __str__(self):
        return f"[{self.get_schedule_type_display()}] {self.title}"
