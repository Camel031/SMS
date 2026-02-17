from django.conf import settings
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class EquipmentCategory(TimestampMixin, UUIDMixin):
    """Equipment category with tree structure (e.g., Lighting > Moving Head)."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "equipment categories"

    def __str__(self) -> str:
        return self.name

    def get_ancestors(self):
        """Return list of ancestors from root to parent."""
        ancestors = []
        current = self.parent
        while current is not None:
            ancestors.insert(0, current)
            current = current.parent
        return ancestors

    def get_full_path(self) -> str:
        """Return full category path (e.g., 'Lighting > Moving Head')."""
        ancestors = self.get_ancestors()
        parts = [a.name for a in ancestors] + [self.name]
        return " > ".join(parts)

    def get_descendant_ids(self, include_self: bool = True) -> list[int]:
        """Return this category's descendant IDs (BFS), optionally including self."""
        if self.id is None:
            return []

        descendant_ids: list[int] = [self.id] if include_self else []
        frontier = [self.id]
        visited = {self.id}

        while frontier:
            child_ids = list(
                EquipmentCategory.objects.filter(parent_id__in=frontier).values_list(
                    "id", flat=True
                )
            )
            frontier = []
            for child_id in child_ids:
                if child_id in visited:
                    continue
                visited.add(child_id)
                descendant_ids.append(child_id)
                frontier.append(child_id)

        return descendant_ids


class EquipmentModel(TimestampMixin, UUIDMixin):
    """Equipment type (e.g., 'Robe MegaPointe'). Not an individual item."""

    category = models.ForeignKey(
        EquipmentCategory,
        on_delete=models.PROTECT,
        related_name="equipment_models",
    )
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=255, blank=True)
    model_number = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    is_numbered = models.BooleanField(
        default=True,
        help_text="If False, tracked by quantity only (e.g., cables).",
    )
    total_quantity = models.PositiveIntegerField(
        default=0,
        help_text="For unnumbered equipment only.",
    )
    image = models.ImageField(upload_to="equipment/models/", null=True, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "name"]
        indexes = [
            models.Index(fields=["category", "is_active"]),
        ]

    def __str__(self) -> str:
        parts = [self.brand, self.name] if self.brand else [self.name]
        return " ".join(parts)


class EquipmentItem(TimestampMixin, UUIDMixin):
    """Individual equipment entity (numbered items only)."""

    class OwnershipType(models.TextChoices):
        OWNED = "owned", "Owned"
        RENTED_IN = "rented_in", "Rented In"

    class Status(models.TextChoices):
        PENDING_RECEIPT = "pending_receipt", "Pending Receipt"
        AVAILABLE = "available", "Available"
        OUT = "out", "Out"
        RESERVED = "reserved", "Reserved"
        LOST = "lost", "Lost"
        RETIRED = "retired", "Retired"
        RETURNED_TO_VENDOR = "returned_to_vendor", "Returned to Vendor"

    equipment_model = models.ForeignKey(
        EquipmentModel,
        on_delete=models.PROTECT,
        related_name="items",
    )
    serial_number = models.CharField(max_length=255, unique=True)
    internal_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Internal company identifier.",
    )
    ownership_type = models.CharField(
        max_length=20,
        choices=OwnershipType.choices,
        default=OwnershipType.OWNED,
    )
    rental_agreement = models.ForeignKey(
        "rentals.RentalAgreement",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipment_items",
    )
    current_status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.AVAILABLE,
        help_text="Denormalized cache. EquipmentStatusLog is source of truth.",
    )
    lamp_hours = models.PositiveIntegerField(default=0)
    purchase_date = models.DateField(null=True, blank=True)
    warranty_expiry = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["equipment_model", "serial_number"]
        indexes = [
            models.Index(fields=["equipment_model", "current_status"]),
            models.Index(fields=["current_status"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(ownership_type="owned", rental_agreement__isnull=True)
                    | models.Q(
                        ownership_type="rented_in", rental_agreement__isnull=False
                    )
                ),
                name="rental_agreement_consistency",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.equipment_model} [{self.serial_number}]"


class EquipmentStatusLog(TimestampMixin):
    """Append-only event log. Single source of truth for equipment status."""

    class Action(models.TextChoices):
        CHECK_OUT = "check_out", "Check Out"
        CHECK_IN = "check_in", "Check In"
        TRANSFER = "transfer", "Transfer"
        REGISTER = "register", "Register"
        DEREGISTER = "deregister", "Deregister"
        RESERVE = "reserve", "Reserve"
        UNRESERVE = "unreserve", "Unreserve"
        MARK_LOST = "mark_lost", "Mark Lost"
        MARK_RETIRED = "mark_retired", "Mark Retired"
        RECONCILE = "reconcile", "Reconcile"

    equipment_item = models.ForeignKey(
        EquipmentItem,
        on_delete=models.CASCADE,
        related_name="status_logs",
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    from_status = models.CharField(max_length=30, blank=True)
    to_status = models.CharField(max_length=30)
    schedule = models.ForeignKey(
        "schedules.Schedule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_status_logs",
    )
    rental_agreement = models.ForeignKey(
        "rentals.RentalAgreement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_status_logs",
    )
    warehouse_transaction = models.ForeignKey(
        "warehouse.WarehouseTransaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_status_logs",
    )
    equipment_transfer = models.ForeignKey(
        "transfers.EquipmentTransfer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_status_logs",
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="performed_status_changes",
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-performed_at"]
        indexes = [
            models.Index(fields=["equipment_item", "-performed_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.equipment_item} | {self.action} | {self.from_status} → {self.to_status}"


class FaultRecord(TimestampMixin, UUIDMixin):
    """Equipment fault / damage report."""

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    equipment_item = models.ForeignKey(
        EquipmentItem,
        on_delete=models.CASCADE,
        related_name="fault_records",
    )
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reported_faults",
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    severity = models.CharField(
        max_length=10,
        choices=Severity.choices,
        default=Severity.MEDIUM,
    )
    is_resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_faults",
    )
    resolution_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        status = "Resolved" if self.is_resolved else "Open"
        return f"[{status}] {self.title} - {self.equipment_item}"


# ── Equipment Templates ──────────────────────────────────────────────


class EquipmentTemplate(TimestampMixin, UUIDMixin):
    """Reusable equipment list template (e.g., 'Standard Concert Rig')."""

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_templates",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class EquipmentTemplateItem(TimestampMixin):
    """Single line item in a template."""

    template = models.ForeignKey(
        EquipmentTemplate,
        on_delete=models.CASCADE,
        related_name="items",
    )
    equipment_model = models.ForeignKey(
        EquipmentModel,
        on_delete=models.CASCADE,
        related_name="template_items",
    )
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = [("template", "equipment_model")]
        ordering = ["equipment_model__category", "equipment_model__name"]

    def __str__(self) -> str:
        return f"{self.equipment_model} x{self.quantity}"
