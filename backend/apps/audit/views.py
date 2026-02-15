from rest_framework import generics

from apps.accounts.permissions import CanViewReports

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogListView(generics.ListAPIView):
    """List audit log entries. Requires can_view_reports permission."""

    serializer_class = AuditLogSerializer
    permission_classes = [CanViewReports]
    filterset_fields = ["category", "action", "entity_type"]
    search_fields = ["description", "user_display", "entity_display"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = AuditLog.objects.all()

        # Filter by user uuid
        user_uuid = self.request.query_params.get("user_uuid")
        if user_uuid:
            qs = qs.filter(user__uuid=user_uuid)

        # Filter by entity
        entity_uuid = self.request.query_params.get("entity_uuid")
        if entity_uuid:
            qs = qs.filter(entity_uuid=entity_uuid)

        return qs


class EntityAuditLogView(generics.ListAPIView):
    """List audit log entries for a specific entity."""

    serializer_class = AuditLogSerializer

    def get_queryset(self):
        return AuditLog.objects.filter(
            entity_type=self.kwargs["entity_type"],
            entity_uuid=self.kwargs["entity_uuid"],
        )
