from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class EquipmentTransfer(TimestampMixin, UUIDMixin):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    from_schedule = models.ForeignKey(
        "schedules.Schedule",
        on_delete=models.PROTECT,
        related_name="transfers_out",
    )
    to_schedule = models.ForeignKey(
        "schedules.Schedule",
        on_delete=models.PROTECT,
        related_name="transfers_in",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PLANNED
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_transfers",
    )
    transferred_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Transfer: {self.from_schedule} \u2192 {self.to_schedule}"
