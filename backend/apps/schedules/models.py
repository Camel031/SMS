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

    # Status transition metadata
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
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_schedules",
    )
    cancellation_reason = models.TextField(blank=True)

    has_conflicts = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-start_datetime"]
        indexes = [
            models.Index(fields=["schedule_type", "status"]),
            models.Index(fields=["start_datetime", "end_datetime"]),
            models.Index(fields=["parent"]),
        ]

    def __str__(self):
        return f"[{self.get_schedule_type_display()}] {self.title}"


class ScheduleEquipment(TimestampMixin):
    """Equipment allocation for a schedule — stores quantity_planned only.
    Actual checkout quantities are computed from CheckoutRecord."""

    schedule = models.ForeignKey(
        Schedule,
        on_delete=models.CASCADE,
        related_name="equipment_allocations",
    )
    equipment_model = models.ForeignKey(
        "equipment.EquipmentModel",
        on_delete=models.PROTECT,
        related_name="schedule_allocations",
    )
    quantity_planned = models.PositiveIntegerField()
    planned_items = models.ManyToManyField(
        "equipment.EquipmentItem",
        blank=True,
        related_name="planned_in_schedules",
    )
    is_over_allocated = models.BooleanField(default=False)
    over_allocation_note = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = [("schedule", "equipment_model")]
        ordering = ["equipment_model__category", "equipment_model__name"]

    def __str__(self):
        return f"{self.schedule.title} — {self.equipment_model} ×{self.quantity_planned}"


class CheckoutRecord(TimestampMixin):
    """Single source of truth for equipment checkout/return.
    Supports both numbered (equipment_item set, quantity=1) and
    unnumbered (equipment_item=null, quantity=N) equipment."""

    schedule_equipment = models.ForeignKey(
        ScheduleEquipment,
        on_delete=models.CASCADE,
        related_name="checkout_records",
    )
    # Numbered: equipment_item set, quantity=1
    # Unnumbered: equipment_item null, quantity=N
    equipment_item = models.ForeignKey(
        "equipment.EquipmentItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkout_records",
    )
    quantity = models.PositiveIntegerField(default=1)

    checked_out_at = models.DateTimeField()
    checked_out_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="checkouts_performed",
    )

    # Close reason 1: returned
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkins_performed",
    )
    quantity_returned = models.PositiveIntegerField(default=0)
    condition_on_return = models.CharField(max_length=20, blank=True)
    return_notes = models.TextField(blank=True)

    # Close reason 2: transferred
    transferred_at = models.DateTimeField(null=True, blank=True)
    transfer = models.ForeignKey(
        "transfers.EquipmentTransfer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkout_records",
    )
    quantity_transferred = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-checked_out_at"]
        constraints = [
            # Numbered item can only have one active checkout
            models.UniqueConstraint(
                fields=["equipment_item"],
                condition=models.Q(
                    equipment_item__isnull=False,
                    checked_in_at__isnull=True,
                    transferred_at__isnull=True,
                ),
                name="unique_active_checkout_per_item",
            ),
            # Unnumbered: returned + transferred cannot exceed quantity
            models.CheckConstraint(
                check=models.Q(
                    quantity_returned__lte=models.F("quantity")
                    - models.F("quantity_transferred")
                ),
                name="checkout_quantity_consistency",
            ),
        ]

    def __str__(self):
        if self.equipment_item:
            return f"Checkout: {self.equipment_item}"
        return f"Checkout: {self.schedule_equipment.equipment_model} ×{self.quantity}"

    @property
    def is_active(self):
        """For numbered items: not returned and not transferred."""
        if self.equipment_item:
            return self.checked_in_at is None and self.transferred_at is None
        # For unnumbered: still has quantity out
        return self.quantity_still_out > 0

    @property
    def quantity_still_out(self):
        """For unnumbered equipment: how many are still out."""
        return self.quantity - self.quantity_returned - self.quantity_transferred


class ScheduleStatusLog(TimestampMixin):
    """Append-only log of schedule status transitions."""

    schedule = models.ForeignKey(
        Schedule,
        on_delete=models.CASCADE,
        related_name="status_logs",
    )
    from_status = models.CharField(max_length=20)
    to_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="schedule_status_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return f"{self.schedule.title}: {self.from_status} → {self.to_status}"
