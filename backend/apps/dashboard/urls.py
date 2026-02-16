from django.urls import path

from . import views

app_name = "dashboard"

urlpatterns = [
    path("summary/", views.dashboard_summary, name="summary"),
    path("upcoming-schedules/", views.dashboard_upcoming_schedules, name="upcoming-schedules"),
    path("attention-items/", views.dashboard_attention_items, name="attention-items"),
    path("recent-activity/", views.dashboard_recent_activity, name="recent-activity"),
    path("timeline/", views.timeline_data, name="timeline"),
    path("timeline/conflicts/", views.timeline_conflicts, name="timeline-conflicts"),
]
