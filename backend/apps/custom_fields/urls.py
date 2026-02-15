from django.urls import path

from . import views

app_name = "custom_fields"

urlpatterns = [
    path(
        "definitions/",
        views.CustomFieldDefinitionListCreateView.as_view(),
        name="definition-list",
    ),
    path(
        "definitions/<int:pk>/",
        views.CustomFieldDefinitionDetailView.as_view(),
        name="definition-detail",
    ),
]
