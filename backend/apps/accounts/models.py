from django.contrib.auth.models import AbstractUser
from django.db import models

from common.models import TimestampMixin, UUIDMixin


class Organization(TimestampMixin, UUIDMixin):
    """Multi-tenant organization (reserved for future use)."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class User(AbstractUser, TimestampMixin, UUIDMixin):
    """Custom user with granular permission flags."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    phone = models.CharField(max_length=20, blank=True)
    is_external = models.BooleanField(
        default=False,
        help_text="External user (e.g., freelancer, vendor)",
    )

    # Granular permission flags
    can_check_in = models.BooleanField(default=False)
    can_check_out = models.BooleanField(default=False)
    requires_confirmation = models.BooleanField(
        default=False,
        help_text="Operations by this user require confirmation from another user",
    )
    can_manage_equipment = models.BooleanField(default=False)
    can_manage_schedules = models.BooleanField(default=False)
    can_manage_users = models.BooleanField(default=False)
    can_view_reports = models.BooleanField(default=False)

    class Meta:
        ordering = ["username"]

    def __str__(self) -> str:
        return self.get_full_name() or self.username
