from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.equipment.models import (
    EquipmentCategory,
    EquipmentItem,
    EquipmentModel,
    FaultRecord,
)
from apps.schedules.models import CheckoutRecord, Schedule, ScheduleEquipment

from .models import TransactionLineItem, WarehouseTransaction
from .services import CheckInService, CheckOutService, ConfirmationService


# ─── Shared base ────────────────────────────────────────────────────────


class WarehouseTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="warehouse_user",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
            can_manage_equipment=True,
            can_manage_schedules=True,
        )
        self.user2 = User.objects.create_user(
            username="warehouse_user2",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
        )
        self.client.force_authenticate(user=self.user)

        # Equipment setup
        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting"
        )
        self.eq_model = EquipmentModel.objects.create(
            name="MegaPointe",
            brand="Robe",
            category=self.category,
            is_numbered=True,
        )
        self.eq_item = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            internal_id="MP-001",
            current_status=EquipmentItem.Status.AVAILABLE,
        )
        self.eq_item2 = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            internal_id="MP-002",
            current_status=EquipmentItem.Status.AVAILABLE,
        )

        # Unnumbered equipment
        self.cable_model = EquipmentModel.objects.create(
            name="XLR Cable 10m",
            category=self.category,
            is_numbered=False,
            total_quantity=50,
        )

        # Schedule setup
        now = timezone.now()
        self.schedule = Schedule.objects.create(
            schedule_type=Schedule.ScheduleType.EVENT,
            status=Schedule.Status.CONFIRMED,
            title="Test Event",
            contact_name="John",
            start_datetime=now + timedelta(days=1),
            end_datetime=now + timedelta(days=3),
            created_by=self.user,
        )


# ─── Service Tests ──────────────────────────────────────────────────────


class CheckOutServiceTest(WarehouseTestBase):
    def test_checkout_numbered_item(self):
        """Check out a numbered item — creates transaction, line items,
        CheckoutRecord, and transitions item to 'out'."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        self.assertEqual(txn.transaction_type, "check_out")
        self.assertEqual(txn.status, WarehouseTransaction.Status.CONFIRMED)
        self.assertEqual(txn.line_items.count(), 1)

        self.eq_item.refresh_from_db()
        self.assertEqual(self.eq_item.current_status, "out")

        # CheckoutRecord should exist
        cr = CheckoutRecord.objects.filter(equipment_item=self.eq_item).first()
        self.assertIsNotNone(cr)
        self.assertIsNone(cr.checked_in_at)

    def test_checkout_unnumbered_equipment(self):
        """Check out unnumbered equipment — quantity-only CheckoutRecord."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.cable_model,
                    "quantity": 10,
                }
            ],
        )
        self.assertEqual(txn.line_items.count(), 1)
        li = txn.line_items.first()
        self.assertEqual(li.quantity, 10)
        self.assertIsNone(li.equipment_item)

        cr = CheckoutRecord.objects.filter(
            schedule_equipment__equipment_model=self.cable_model
        ).first()
        self.assertIsNotNone(cr)
        self.assertEqual(cr.quantity, 10)
        self.assertIsNone(cr.equipment_item)

    def test_checkout_with_pending_confirmation(self):
        """When requires_confirmation=True, no side effects are applied."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )
        self.assertEqual(txn.status, WarehouseTransaction.Status.PENDING_CONFIRMATION)

        # Item should still be available (no side effects yet)
        self.eq_item.refresh_from_db()
        self.assertEqual(self.eq_item.current_status, "available")

    def test_checkout_auto_begins_schedule(self):
        """First checkout should transition CONFIRMED schedule to IN_PROGRESS."""
        CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.IN_PROGRESS)


class CheckInServiceTest(WarehouseTestBase):
    def setUp(self):
        super().setUp()
        # First check out an item
        self.checkout_txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        self.eq_item.refresh_from_db()  # now 'out'

    def test_checkin_numbered_item(self):
        """Check in a numbered item — transitions to 'available', closes record."""
        txn = CheckInService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        self.assertEqual(txn.transaction_type, "check_in")
        self.assertEqual(txn.status, WarehouseTransaction.Status.CONFIRMED)

        self.eq_item.refresh_from_db()
        self.assertEqual(self.eq_item.current_status, "available")

        # CheckoutRecord should be closed
        cr = CheckoutRecord.objects.filter(equipment_item=self.eq_item).first()
        self.assertIsNotNone(cr.checked_in_at)

    def test_checkin_creates_fault_for_damaged_item(self):
        """Returning a damaged item creates a FaultRecord."""
        CheckInService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                    "condition_on_return": "damaged",
                }
            ],
        )
        faults = FaultRecord.objects.filter(equipment_item=self.eq_item)
        self.assertEqual(faults.count(), 1)
        self.assertIn("Damage reported", faults.first().title)

    def test_checkin_auto_completes_schedule(self):
        """After all items returned, schedule should auto-complete."""
        CheckInService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.status, Schedule.Status.COMPLETED)


class ConfirmationServiceTest(WarehouseTestBase):
    def test_confirm_pending_transaction(self):
        """Confirm a pending transaction — applies side effects."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )

        txn = ConfirmationService.confirm(txn, confirmed_by=self.user2, notes="OK")
        self.assertEqual(txn.status, WarehouseTransaction.Status.CONFIRMED)
        self.assertEqual(txn.confirmed_by, self.user2)

        self.eq_item.refresh_from_db()
        self.assertEqual(self.eq_item.current_status, "out")

    def test_confirm_same_user_raises(self):
        """Confirming user must differ from performer."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )
        with self.assertRaises(ValueError):
            ConfirmationService.confirm(txn, confirmed_by=self.user)

    def test_cancel_pending_transaction(self):
        """Cancel a pending transaction — no side effects."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )

        txn = ConfirmationService.cancel(txn, cancelled_by=self.user, notes="Nope")
        self.assertEqual(txn.status, WarehouseTransaction.Status.CANCELLED)

        self.eq_item.refresh_from_db()
        self.assertEqual(self.eq_item.current_status, "available")


# ─── API Tests ──────────────────────────────────────────────────────────


class WarehouseAPITest(WarehouseTestBase):
    def test_checkout_api(self):
        """POST /warehouse/check-out/ with numbered item."""
        resp = self.client.post(
            "/api/v1/warehouse/check-out/",
            {
                "schedule_uuid": str(self.schedule.uuid),
                "items": [
                    {
                        "equipment_model_uuid": str(self.eq_model.uuid),
                        "equipment_item_uuid": str(self.eq_item.uuid),
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["transaction_type"], "check_out")
        self.assertEqual(resp.data["status"], "confirmed")
        self.assertEqual(len(resp.data["line_items"]), 1)

    def test_checkin_api(self):
        """POST /warehouse/check-in/ after a checkout."""
        # First check out
        self.client.post(
            "/api/v1/warehouse/check-out/",
            {
                "schedule_uuid": str(self.schedule.uuid),
                "items": [
                    {
                        "equipment_model_uuid": str(self.eq_model.uuid),
                        "equipment_item_uuid": str(self.eq_item.uuid),
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )

        # Then check in
        resp = self.client.post(
            "/api/v1/warehouse/check-in/",
            {
                "schedule_uuid": str(self.schedule.uuid),
                "items": [
                    {
                        "equipment_model_uuid": str(self.eq_model.uuid),
                        "equipment_item_uuid": str(self.eq_item.uuid),
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["transaction_type"], "check_in")

    def test_transaction_list_api(self):
        """GET /warehouse/transactions/ returns list of transactions."""
        CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        resp = self.client.get("/api/v1/warehouse/transactions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_confirm_api(self):
        """POST /warehouse/transactions/{uuid}/confirm/ with different user."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )

        self.client.force_authenticate(user=self.user2)
        resp = self.client.post(
            f"/api/v1/warehouse/transactions/{txn.uuid}/confirm/",
            {"notes": "Looks good"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "confirmed")

    def test_cancel_api(self):
        """POST /warehouse/transactions/{uuid}/cancel/."""
        txn = CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )

        resp = self.client.post(
            f"/api/v1/warehouse/transactions/{txn.uuid}/cancel/",
            {"notes": "Not needed"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    def test_pending_confirmations_api(self):
        """GET /warehouse/pending-confirmations/ returns pending only."""
        CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            requires_confirmation=True,
        )
        CheckOutService.execute(
            performed_by=self.user,
            schedule=self.schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item2,
                    "quantity": 1,
                }
            ],
            requires_confirmation=False,
        )

        resp = self.client.get("/api/v1/warehouse/pending-confirmations/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Only the pending one should appear
        self.assertEqual(resp.data["count"], 1)

    def test_mutually_exclusive_validation(self):
        """Sending both schedule_uuid and rental_agreement_uuid is 400."""
        from apps.rentals.models import RentalAgreement

        ra = RentalAgreement.objects.create(
            direction="in",
            vendor_name="Vendor A",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            created_by=self.user,
        )
        resp = self.client.post(
            "/api/v1/warehouse/check-out/",
            {
                "schedule_uuid": str(self.schedule.uuid),
                "rental_agreement_uuid": str(ra.uuid),
                "items": [
                    {
                        "equipment_model_uuid": str(self.eq_model.uuid),
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
