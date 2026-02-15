from django.urls import path

from . import views

app_name = "audit"

urlpatterns = [
    path("", views.AuditLogListView.as_view(), name="audit-list"),
    path(
        "<str:entity_type>/<uuid:entity_uuid>/",
        views.EntityAuditLogView.as_view(),
        name="entity-audit",
    ),
]
