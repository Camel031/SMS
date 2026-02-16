from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    DEFAULT_PREFERENCES,
    EVENT_TYPE_CONFIG,
    Notification,
    NotificationChannel,
    NotificationEventType,
    UserNotificationPreference,
)
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """List notifications for the current user, newest first."""

    serializer_class = NotificationSerializer
    filterset_fields = ["category", "severity", "is_read"]

    def get_queryset(self):
        return (
            Notification.objects.filter(recipient=self.request.user)
            .select_related("actor")
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count_view(request):
    """Return the count of unread notifications."""
    count = Notification.objects.filter(
        recipient=request.user, is_read=False
    ).count()
    return Response({"count": count})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read_view(request, uuid):
    """Mark a single notification as read."""
    try:
        notification = Notification.objects.get(
            uuid=uuid, recipient=request.user
        )
    except Notification.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at", "updated_at"])

    return Response(NotificationSerializer(notification).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read_view(request):
    """Mark all notifications as read for the current user."""
    now = timezone.now()
    updated = Notification.objects.filter(
        recipient=request.user, is_read=False
    ).update(is_read=True, read_at=now, updated_at=now)
    return Response({"marked": updated})


# ── Notification Preferences ─────────────────────────────────────────────


def _build_preference_matrix(user):
    """Build the full preference matrix with defaults for missing entries."""
    overrides = {
        (p.event_type, p.channel): p.is_enabled
        for p in UserNotificationPreference.objects.filter(user=user)
    }

    event_types = [
        {
            "key": evt_value,
            "display_name": evt_label,
            "category": EVENT_TYPE_CONFIG[evt_value]["category"],
            "description": EVENT_TYPE_CONFIG[evt_value]["description"],
        }
        for evt_value, evt_label in NotificationEventType.choices
    ]

    channels = [
        {"key": ch_value, "display_name": ch_label}
        for ch_value, ch_label in NotificationChannel.choices
    ]

    preferences: dict[str, dict[str, bool]] = {}
    for evt_value, _ in NotificationEventType.choices:
        preferences[evt_value] = {}
        for ch_value, _ in NotificationChannel.choices:
            key = (evt_value, ch_value)
            if key in overrides:
                preferences[evt_value][ch_value] = overrides[key]
            else:
                preferences[evt_value][ch_value] = DEFAULT_PREFERENCES.get(key, False)

    return {
        "event_types": event_types,
        "channels": channels,
        "preferences": preferences,
    }


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def preferences_view(request):
    """GET: full preference matrix. PATCH: toggle a single cell."""
    if request.method == "GET":
        return Response(_build_preference_matrix(request.user))

    # PATCH — toggle single preference
    event_type = request.data.get("event_type")
    channel = request.data.get("channel")
    is_enabled = request.data.get("is_enabled")

    if event_type not in NotificationEventType.values:
        return Response(
            {"detail": f"Invalid event_type: {event_type}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if channel not in NotificationChannel.values:
        return Response(
            {"detail": f"Invalid channel: {channel}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not isinstance(is_enabled, bool):
        return Response(
            {"detail": "is_enabled must be a boolean"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    UserNotificationPreference.objects.update_or_create(
        user=request.user,
        event_type=event_type,
        channel=channel,
        defaults={"is_enabled": is_enabled},
    )
    return Response(_build_preference_matrix(request.user))


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def bulk_toggle_view(request):
    """Toggle an entire channel column ON or OFF."""
    channel = request.data.get("channel")
    is_enabled = request.data.get("is_enabled")

    if channel not in NotificationChannel.values:
        return Response(
            {"detail": f"Invalid channel: {channel}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not isinstance(is_enabled, bool):
        return Response(
            {"detail": "is_enabled must be a boolean"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    prefs = [
        UserNotificationPreference(
            user=request.user,
            event_type=evt,
            channel=channel,
            is_enabled=is_enabled,
        )
        for evt in NotificationEventType.values
    ]
    UserNotificationPreference.objects.bulk_create(
        prefs,
        update_conflicts=True,
        unique_fields=["user", "event_type", "channel"],
        update_fields=["is_enabled", "updated_at"],
    )
    return Response(_build_preference_matrix(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reset_preferences_view(request):
    """Delete all user overrides — reverts to system defaults."""
    deleted, _ = UserNotificationPreference.objects.filter(
        user=request.user
    ).delete()
    return Response({
        "deleted": deleted,
        **_build_preference_matrix(request.user),
    })
