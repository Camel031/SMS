from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.equipment.models import EquipmentCategory, EquipmentItem, EquipmentModel
from apps.schedules.models import CheckoutRecord, Schedule, ScheduleEquipment
from apps.warehouse.services import CheckOutService

from .models import EquipmentTransfer, TransferLineItem
from .services import InvalidTransferError, TransferService


# ─── Shared base ────────────────────────────────────────────────────────


class TransferTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="transfer_user",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
            can_manage_equipment=True,
            can_manage_schedules=True,
        )
        self.user2 = User.objects.create_user(
            username="transfer_user2",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
        )
        self.client.force_authenticate(user=self.user)

        # Equipment
        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting-t"
        )
        self.eq_model = EquipmentModel.objects.create(
            name="MegaPointe",
            brand="Robe",
            category=self.category,
            is_numbered=True,
        )
        self.eq_item = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            serial_number="MP-T001",
            current_status=EquipmentItem.Status.AVAILABLE,
        )

        # Two schedules
        now = timezone.now()
        self.from_schedule = Schedule.objects.create(
            schedule_type="event",
            status=Schedule.Status.IN_PROGRESS,
            title="Source Event",
            contact_name="Alice",
            start_datetime=now - timedelta(days=1),
            end_datetime=now + timedelta(days=5),
            started_at=now - timedelta(hours=1),
            created_by=self.user,
        )
        self.to_schedule = Schedule.objects.create(
            schedule_type="event",
            status=Schedule.Status.CONFIRMED,
            title="Destination Event",
            contact_name="Bob",
            start_datetime=now + timedelta(days=2),
            end_datetime=now + timedelta(days=7),
            created_by=self.user,
        )

        # Pre-checkout item to from_schedule
        CheckOutService.execute(
            performed_by=self.user,
            schedule=self.from_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
        )
        self.eq_item.refresh_from_db()  # now 'out'


# ─── Service Tests ──────────────────────────────────────────────────────


class TransferServiceTest(TransferTestBase):
    def test_create_transfer(self):
        """Create a PLANNED transfer between two schedules."""
        transfer = TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        self.assertEqual(transfer.status, EquipmentTransfer.Status.PLANNED)
        self.assertEqual(transfer.line_items.count(), 1)

    def test_execute_transfer(self):
        """Execute a transfer — moves CheckoutRecord from source to destination."""
        transfer = TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        transfer = TransferService.execute(transfer, self.user)
        self.assertEqual(transfer.status, EquipmentTransfer.Status.CONFIRMED)
        self.assertIsNotNone(transfer.executed_at)

        # Source checkout should be closed (transferred_at set)
        source_cr = CheckoutRecord.objects.filter(
            schedule_equipment__schedule=self.from_schedule,
            equipment_item=self.eq_item,
        ).first()
        self.assertIsNotNone(source_cr.transferred_at)

        # Destination should have a new active checkout
        dest_cr = CheckoutRecord.objects.filter(
            schedule_equipment__schedule=self.to_schedule,
            equipment_item=self.eq_item,
            checked_in_at__isnull=True,
            transferred_at__isnull=True,
        ).first()
        self.assertIsNotNone(dest_cr)

    def test_cancel_transfer(self):
        """Cancel a PLANNED transfer — no equipment side effects."""
        transfer = TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        transfer = TransferService.cancel(transfer, self.user, notes="Changed plans")
        self.assertEqual(transfer.status, EquipmentTransfer.Status.CANCELLED)

        # Item should still be out at source
        self.eq_item.refresh_from_db()
        self.assertEqual(self.eq_item.current_status, "out")

    def test_source_must_be_in_progress(self):
        """Transfer from a non-IN_PROGRESS schedule raises error."""
        self.from_schedule.status = Schedule.Status.CONFIRMED
        self.from_schedule.save(update_fields=["status"])

        with self.assertRaises(InvalidTransferError):
            TransferService.create(
                from_schedule=self.from_schedule,
                to_schedule=self.to_schedule,
                items=[
                    {
                        "equipment_model": self.eq_model,
                        "equipment_item": self.eq_item,
                        "quantity": 1,
                    }
                ],
                performed_by=self.user,
            )

    def test_self_transfer_fails(self):
        """Cannot transfer from and to the same schedule."""
        with self.assertRaises(InvalidTransferError):
            TransferService.create(
                from_schedule=self.from_schedule,
                to_schedule=self.from_schedule,
                items=[
                    {
                        "equipment_model": self.eq_model,
                        "equipment_item": self.eq_item,
                        "quantity": 1,
                    }
                ],
                performed_by=self.user,
            )

    def test_confirm_transfer_dual_person(self):
        """Confirm with dual-person — executes and records confirmer."""
        transfer = TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        transfer = TransferService.confirm(transfer, confirmed_by=self.user2)
        self.assertEqual(transfer.status, EquipmentTransfer.Status.CONFIRMED)
        self.assertEqual(transfer.confirmed_by, self.user2)
        self.assertIsNotNone(transfer.confirmed_at)


# ─── API Tests ──────────────────────────────────────────────────────────


class TransferAPITest(TransferTestBase):
    def test_create_transfer_api(self):
        """POST /transfers/transfers/ creates a PLANNED transfer."""
        resp = self.client.post(
            "/api/v1/transfers/transfers/",
            {
                "from_schedule_uuid": str(self.from_schedule.uuid),
                "to_schedule_uuid": str(self.to_schedule.uuid),
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
        self.assertEqual(resp.data["status"], "planned")

    def test_execute_transfer_api(self):
        """POST /transfers/transfers/{uuid}/execute/ executes the transfer."""
        transfer = TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        resp = self.client.post(
            f"/api/v1/transfers/transfers/{transfer.uuid}/execute/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "confirmed")

    def test_cancel_transfer_api(self):
        """POST /transfers/transfers/{uuid}/cancel/ cancels the transfer."""
        transfer = TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        resp = self.client.post(
            f"/api/v1/transfers/transfers/{transfer.uuid}/cancel/",
            {"notes": "Not needed"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    def test_transfer_list_api(self):
        """GET /transfers/transfers/ returns transfers."""
        TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        resp = self.client.get("/api/v1/transfers/transfers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_schedule_transfers_api(self):
        """GET /transfers/schedules/{uuid}/transfers/ returns transfers for schedule."""
        TransferService.create(
            from_schedule=self.from_schedule,
            to_schedule=self.to_schedule,
            items=[
                {
                    "equipment_model": self.eq_model,
                    "equipment_item": self.eq_item,
                    "quantity": 1,
                }
            ],
            performed_by=self.user,
        )
        resp = self.client.get(
            f"/api/v1/transfers/schedules/{self.from_schedule.uuid}/transfers/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)
