from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "uuid",
            "category",
            "severity",
            "title",
            "message",
            "is_read",
            "read_at",
            "entity_type",
            "entity_uuid",
            "actor_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj) -> str:
        if obj.actor:
            return obj.actor.get_full_name() or obj.actor.username
        return ""


class UnreadCountSerializer(serializers.Serializer):
    count = serializers.IntegerField()
