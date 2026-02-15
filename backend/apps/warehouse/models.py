from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class WarehouseTransaction(TimestampMixin, UUIDMixin):
    class TransactionType(models.TextChoices):
        CHECK_OUT = "check_out", "Check Out"
        CHECK_IN = "check_in", "Check In"

    class Status(models.TextChoices):
        PENDING_CONFIRMATION = "pending_confirmation", "Pending Confirmation"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    transaction_type = models.CharField(
        max_length=20, choices=TransactionType.choices
    )
    status = models.CharField(
        max_length=25, choices=Status.choices, default=Status.CONFIRMED
    )
    schedule = models.ForeignKey(
        "schedules.Schedule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="warehouse_transactions",
    )
    rental_agreement = models.ForeignKey(
        "rentals.RentalAgreement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="warehouse_transactions",
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="performed_transactions",
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_transactions",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    requires_confirmation = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=~models.Q(
                    schedule__isnull=False,
                    rental_agreement__isnull=False,
                ),
                name="wt_schedule_rental_mutually_exclusive",
            ),
        ]

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.created_at}"


class TransactionLineItem(TimestampMixin):
    """Individual line item within a warehouse transaction."""

    transaction = models.ForeignKey(
        WarehouseTransaction,
        on_delete=models.CASCADE,
        related_name="line_items",
    )
    equipment_model = models.ForeignKey(
        "equipment.EquipmentModel",
        on_delete=models.PROTECT,
        related_name="transaction_line_items",
    )
    equipment_item = models.ForeignKey(
        "equipment.EquipmentItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transaction_line_items",
    )
    quantity = models.PositiveIntegerField(default=1)
    condition_on_return = models.CharField(max_length=20, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        if self.equipment_item:
            return f"{self.equipment_item}"
        return f"{self.equipment_model} ×{self.quantity}"
