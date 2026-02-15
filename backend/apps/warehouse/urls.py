from django.urls import path

from . import views

app_name = "warehouse"

urlpatterns = [
    # Check-out / Check-in operations
    path("check-out/", views.check_out_view, name="check-out"),
    path("check-in/", views.check_in_view, name="check-in"),
    # Transaction list & detail
    path("transactions/", views.TransactionListView.as_view(), name="transaction-list"),
    path("transactions/<uuid:uuid>/", views.TransactionDetailView.as_view(), name="transaction-detail"),
    # Confirm / Cancel pending transactions
    path("transactions/<uuid:uuid>/confirm/", views.transaction_confirm_view, name="transaction-confirm"),
    path("transactions/<uuid:uuid>/cancel/", views.transaction_cancel_view, name="transaction-cancel"),
    # Pending confirmations convenience endpoint
    path("pending-confirmations/", views.PendingConfirmationListView.as_view(), name="pending-confirmations"),
]
