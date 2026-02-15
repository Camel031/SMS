from django.urls import path

from . import views

app_name = "equipment"

urlpatterns = [
    # Categories
    path("categories/", views.CategoryListCreateView.as_view(), name="category-list"),
    path("categories/tree/", views.CategoryTreeView.as_view(), name="category-tree"),
    path("categories/<uuid:uuid>/", views.CategoryDetailView.as_view(), name="category-detail"),
    # Models
    path("models/", views.EquipmentModelListCreateView.as_view(), name="model-list"),
    path("models/<uuid:uuid>/", views.EquipmentModelDetailView.as_view(), name="model-detail"),
    path("models/<uuid:uuid>/availability/", views.model_availability_view, name="model-availability"),
    # Items
    path("items/", views.EquipmentItemListCreateView.as_view(), name="item-list"),
    path("items/<uuid:uuid>/", views.EquipmentItemDetailView.as_view(), name="item-detail"),
    path("items/<uuid:uuid>/history/", views.EquipmentItemHistoryView.as_view(), name="item-history"),
    path("items/<uuid:uuid>/fault/", views.FaultRecordCreateView.as_view(), name="item-fault-create"),
    # Faults
    path("faults/", views.FaultRecordListView.as_view(), name="fault-list"),
    path("faults/<uuid:uuid>/", views.FaultRecordDetailView.as_view(), name="fault-detail"),
    path("faults/<uuid:uuid>/resolve/", views.fault_resolve_view, name="fault-resolve"),
    # Inventory
    path("inventory/", views.inventory_summary_view, name="inventory-summary"),
    path("inventory/by-status/", views.inventory_by_status_view, name="inventory-by-status"),
]
