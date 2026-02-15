from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "uuid",
            "user_display",
            "action",
            "category",
            "description",
            "entity_type",
            "entity_uuid",
            "entity_display",
            "changes",
            "ip_address",
            "created_at",
        ]
        read_only_fields = fields
