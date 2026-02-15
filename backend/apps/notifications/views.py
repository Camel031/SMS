from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
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
