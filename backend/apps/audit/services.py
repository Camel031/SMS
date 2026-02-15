from .models import AuditLog


class AuditService:
    """Central service for recording audit trail entries."""

    @staticmethod
    def log(
        *,
        user,
        action: str,
        category: str,
        description: str,
        entity_type: str = "",
        entity_uuid=None,
        entity_display: str = "",
        changes: dict | None = None,
        request=None,
    ) -> AuditLog:
        ip_address = None
        if request:
            ip_address = (
                request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
                or request.META.get("REMOTE_ADDR")
            )

        return AuditLog.objects.create(
            user=user,
            user_display=str(user) if user else "System",
            action=action,
            category=category,
            description=description,
            entity_type=entity_type,
            entity_uuid=entity_uuid,
            entity_display=entity_display,
            changes=changes,
            ip_address=ip_address,
        )

    # ── Convenience helpers ──────────────────────────────────────

    @classmethod
    def log_schedule_action(cls, *, user, action, schedule, description="", request=None):
        cls.log(
            user=user,
            action=action,
            category=AuditLog.ActionCategory.SCHEDULE,
            description=description or f"{action} schedule \"{schedule.title}\"",
            entity_type="schedule",
            entity_uuid=schedule.uuid,
            entity_display=schedule.title,
            request=request,
        )

    @classmethod
    def log_equipment_action(cls, *, user, action, item, description="", changes=None, request=None):
        cls.log(
            user=user,
            action=action,
            category=AuditLog.ActionCategory.EQUIPMENT,
            description=description or f"{action} equipment item {item}",
            entity_type="equipment_item",
            entity_uuid=item.uuid,
            entity_display=str(item),
            changes=changes,
            request=request,
        )

    @classmethod
    def log_warehouse_action(cls, *, user, action, transaction, description="", request=None):
        cls.log(
            user=user,
            action=action,
            category=AuditLog.ActionCategory.WAREHOUSE,
            description=description or f"{action} warehouse transaction",
            entity_type="warehouse_transaction",
            entity_uuid=transaction.uuid,
            entity_display=str(transaction),
            request=request,
        )

    @classmethod
    def log_rental_action(cls, *, user, action, agreement, description="", request=None):
        cls.log(
            user=user,
            action=action,
            category=AuditLog.ActionCategory.RENTAL,
            description=description or f"{action} rental agreement {agreement.agreement_number}",
            entity_type="rental_agreement",
            entity_uuid=agreement.uuid,
            entity_display=agreement.agreement_number,
            request=request,
        )

    @classmethod
    def log_transfer_action(cls, *, user, action, transfer, description="", request=None):
        cls.log(
            user=user,
            action=action,
            category=AuditLog.ActionCategory.TRANSFER,
            description=description or f"{action} transfer",
            entity_type="equipment_transfer",
            entity_uuid=transfer.uuid,
            entity_display=str(transfer),
            request=request,
        )
