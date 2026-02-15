from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class RentalAgreement(TimestampMixin, UUIDMixin):
    class Direction(models.TextChoices):
        IN = "in", "Rental In"
        OUT = "out", "Rental Out"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    direction = models.CharField(max_length=3, choices=Direction.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    vendor_name = models.CharField(max_length=255)
    vendor_contact = models.CharField(max_length=255, blank=True)
    vendor_phone = models.CharField(max_length=20, blank=True)
    vendor_email = models.EmailField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_rental_agreements",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.get_direction_display()}] {self.vendor_name}"
