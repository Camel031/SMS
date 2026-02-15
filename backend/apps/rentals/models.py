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
        RETURNING = "returning", "Returning"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    direction = models.CharField(max_length=3, choices=Direction.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    agreement_number = models.CharField(
        max_length=50, unique=True, blank=True
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
        indexes = [
            models.Index(fields=["direction", "status"]),
        ]

    def __str__(self):
        return f"[{self.get_direction_display()}] {self.vendor_name} ({self.agreement_number})"

    def save(self, *args, **kwargs):
        if not self.agreement_number:
            self.agreement_number = self._generate_agreement_number()
        super().save(*args, **kwargs)

    def _generate_agreement_number(self):
        """Generate agreement number like RA-IN-26-0001 or RA-OUT-26-0001."""
        import datetime

        prefix = f"RA-{self.direction.upper()}"
        year = datetime.date.today().strftime("%y")
        last = (
            RentalAgreement.objects.filter(
                agreement_number__startswith=f"{prefix}-{year}"
            )
            .order_by("-agreement_number")
            .values_list("agreement_number", flat=True)
            .first()
        )
        if last:
            seq = int(last.split("-")[-1]) + 1
        else:
            seq = 1
        return f"{prefix}-{year}-{seq:04d}"


class RentalAgreementLine(TimestampMixin):
    """Line item within a rental agreement — defines what models and quantities."""

    agreement = models.ForeignKey(
        RentalAgreement,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    equipment_model = models.ForeignKey(
        "equipment.EquipmentModel",
        on_delete=models.PROTECT,
        related_name="rental_agreement_lines",
    )
    quantity = models.PositiveIntegerField()
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = [("agreement", "equipment_model")]
        ordering = ["id"]

    def __str__(self):
        return f"{self.equipment_model} ×{self.quantity}"
