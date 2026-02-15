from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class EquipmentTransfer(TimestampMixin, UUIDMixin):
    """Equipment transfer between schedules (without returning to warehouse)."""

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
    planned_datetime = models.DateTimeField(null=True, blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="performed_transfers",
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_transfers",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_transfers",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=~models.Q(from_schedule=models.F("to_schedule")),
                name="transfer_no_self_transfer",
            ),
        ]

    def __str__(self):
        return f"Transfer: {self.from_schedule} → {self.to_schedule}"


class TransferLineItem(TimestampMixin):
    """Individual line item within a transfer."""

    transfer = models.ForeignKey(
        EquipmentTransfer,
        on_delete=models.CASCADE,
        related_name="line_items",
    )
    equipment_model = models.ForeignKey(
        "equipment.EquipmentModel",
        on_delete=models.PROTECT,
        related_name="transfer_line_items",
    )
    equipment_item = models.ForeignKey(
        "equipment.EquipmentItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfer_line_items",
    )
    quantity = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        if self.equipment_item:
            return f"{self.equipment_item}"
        return f"{self.equipment_model} ×{self.quantity}"
