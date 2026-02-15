from django.urls import path

from . import views

app_name = "schedules"

urlpatterns = [
    # Schedule CRUD
    path("schedules/", views.ScheduleListCreateView.as_view(), name="schedule-list"),
    # Availability check (before detail route to avoid uuid capture)
    path("schedules/check-availability/", views.check_availability_view, name="check-availability"),
    # Schedule detail
    path("schedules/<uuid:uuid>/", views.ScheduleDetailView.as_view(), name="schedule-detail"),
    # Equipment allocations nested under schedule
    path("schedules/<uuid:schedule_uuid>/equipment/", views.ScheduleEquipmentListCreateView.as_view(), name="schedule-equipment-list"),
    path("schedules/<uuid:schedule_uuid>/equipment/<int:pk>/", views.ScheduleEquipmentDetailView.as_view(), name="schedule-equipment-detail"),
    # Dispatch events nested under schedule
    path("schedules/<uuid:schedule_uuid>/dispatches/", views.DispatchEventListCreateView.as_view(), name="dispatch-event-list"),
    # Status transition endpoints
    path("schedules/<uuid:uuid>/confirm/", views.schedule_confirm_view, name="schedule-confirm"),
    path("schedules/<uuid:uuid>/complete/", views.schedule_complete_view, name="schedule-complete"),
    path("schedules/<uuid:uuid>/cancel/", views.schedule_cancel_view, name="schedule-cancel"),
    path("schedules/<uuid:uuid>/reopen/", views.schedule_reopen_view, name="schedule-reopen"),
]
