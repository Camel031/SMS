from django.urls import path

from . import views

urlpatterns = [
    path("users/", views.UserListCreateView.as_view(), name="user-list"),
    path("users/<uuid:uuid>/", views.UserDetailView.as_view(), name="user-detail"),
    path(
        "users/<uuid:uuid>/permissions/",
        views.UserPermissionView.as_view(),
        name="user-permissions",
    ),
]
