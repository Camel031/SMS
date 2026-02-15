from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class WarehouseTransaction(TimestampMixin, UUIDMixin):
    class TransactionType(models.TextChoices):
        CHECK_OUT = "check_out", "Check Out"
        CHECK_IN = "check_in", "Check In"

    transaction_type = models.CharField(
        max_length=20, choices=TransactionType.choices
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

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.created_at}"
