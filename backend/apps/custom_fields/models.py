from django.db import models

from common.models import TimestampMixin


class CustomFieldDefinition(TimestampMixin):
    """Dynamic field definition for equipment models/items."""

    class FieldType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        BOOLEAN = "boolean", "Boolean"
        DATE = "date", "Date"
        SELECT = "select", "Select"
        MULTISELECT = "multiselect", "Multi-Select"

    class EntityType(models.TextChoices):
        EQUIPMENT_MODEL = "equipment_model", "Equipment Model"
        EQUIPMENT_ITEM = "equipment_item", "Equipment Item"

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    field_type = models.CharField(max_length=20, choices=FieldType.choices)
    entity_type = models.CharField(max_length=20, choices=EntityType.choices)
    category = models.ForeignKey(
        "equipment.EquipmentCategory",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="custom_field_definitions",
        help_text="If set, this field only applies to this category.",
    )
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    placeholder = models.CharField(max_length=200, blank=True)
    options = models.JSONField(
        null=True,
        blank=True,
        help_text='For SELECT/MULTISELECT: [{"value":"dmx","label":"DMX"}]',
    )
    validation_rules = models.JSONField(
        null=True,
        blank=True,
        help_text='e.g., {"min":0,"max":100}',
    )
    display_order = models.PositiveIntegerField(default=0)
    is_filterable = models.BooleanField(default=False)
    is_visible_in_list = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = [("slug", "entity_type")]

    def __str__(self) -> str:
        return f"{self.name} ({self.entity_type})"
