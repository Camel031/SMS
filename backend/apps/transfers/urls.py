from django.urls import path

from . import views

app_name = "transfers"

urlpatterns = [
    # Transfer CRUD
    path(
        "transfers/",
        views.TransferListCreateView.as_view(),
        name="transfer-list",
    ),
    path(
        "transfers/<uuid:uuid>/",
        views.TransferDetailView.as_view(),
        name="transfer-detail",
    ),
    # Transfer actions
    path(
        "transfers/<uuid:uuid>/execute/",
        views.transfer_execute_view,
        name="transfer-execute",
    ),
    path(
        "transfers/<uuid:uuid>/confirm/",
        views.transfer_confirm_view,
        name="transfer-confirm",
    ),
    path(
        "transfers/<uuid:uuid>/cancel/",
        views.transfer_cancel_view,
        name="transfer-cancel",
    ),
    # Schedule-scoped transfers (both incoming and outgoing)
    path(
        "schedules/<uuid:schedule_uuid>/transfers/",
        views.ScheduleTransferListView.as_view(),
        name="schedule-transfer-list",
    ),
]
