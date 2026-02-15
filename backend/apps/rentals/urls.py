from django.urls import path

from . import views

app_name = "rentals"

urlpatterns = [
    # Agreement CRUD
    path("agreements/", views.AgreementListCreateView.as_view(), name="agreement-list"),
    path("agreements/<uuid:uuid>/", views.AgreementDetailView.as_view(), name="agreement-detail"),
    # Agreement lines
    path("agreements/<uuid:uuid>/lines/", views.AgreementLineListCreateView.as_view(), name="agreement-line-list"),
    path("agreements/<uuid:uuid>/lines/<int:pk>/", views.AgreementLineDetailView.as_view(), name="agreement-line-detail"),
    # Lifecycle actions
    path("agreements/<uuid:uuid>/activate/", views.agreement_activate_view, name="agreement-activate"),
    path("agreements/<uuid:uuid>/receive/", views.agreement_receive_view, name="agreement-receive"),
    path("agreements/<uuid:uuid>/return/", views.agreement_return_view, name="agreement-return"),
    path("agreements/<uuid:uuid>/extend/", views.agreement_extend_view, name="agreement-extend"),
    path("agreements/<uuid:uuid>/cancel/", views.agreement_cancel_view, name="agreement-cancel"),
    # Equipment items for agreement
    path("agreements/<uuid:uuid>/equipment/", views.agreement_equipment_view, name="agreement-equipment"),
]
