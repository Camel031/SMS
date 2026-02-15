from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.accounts.urls_users")),
    path("api/v1/equipment/", include("apps.equipment.urls")),
    path("api/v1/custom-fields/", include("apps.custom_fields.urls")),
    path("api/v1/", include("apps.schedules.urls")),
    path("api/v1/warehouse/", include("apps.warehouse.urls")),
    path("api/v1/transfers/", include("apps.transfers.urls")),
    path("api/v1/rentals/", include("apps.rentals.urls")),
    path("api/v1/dashboard/", include("apps.dashboard.urls")),
    # API documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
