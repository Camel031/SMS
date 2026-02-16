from django.urls import path

from . import views

app_name = "notifications"

urlpatterns = [
    path("", views.NotificationListView.as_view(), name="notification-list"),
    path("unread-count/", views.unread_count_view, name="unread-count"),
    path("<uuid:uuid>/read/", views.mark_read_view, name="mark-read"),
    path("mark-all-read/", views.mark_all_read_view, name="mark-all-read"),
    path("preferences/", views.preferences_view, name="preferences"),
    path("preferences/bulk/", views.bulk_toggle_view, name="preferences-bulk"),
    path("preferences/reset/", views.reset_preferences_view, name="preferences-reset"),
]
