from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.equipment.models import EquipmentCategory, EquipmentItem, EquipmentModel
from apps.equipment.services import EquipmentStatusService

from .models import RentalAgreement, RentalAgreementLine
from .services import InvalidRentalOperationError, RentalService


# ─── Shared base ────────────────────────────────────────────────────────


class RentalTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="rental_user",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
            can_manage_equipment=True,
            can_manage_schedules=True,
        )
        self.client.force_authenticate(user=self.user)

        # Equipment
        self.category = EquipmentCategory.objects.create(
            name="Audio", slug="audio-r"
        )
        self.eq_model = EquipmentModel.objects.create(
            name="L-Acoustics K2",
            brand="L-Acoustics",
            category=self.category,
            is_numbered=True,
        )

        # Date helpers
        self.today = date.today()
        self.start_date = self.today
        self.end_date = self.today + timedelta(days=30)

    def _create_agreement(self, direction="in", **overrides):
        """Helper to create a rental agreement directly."""
        defaults = {
            "direction": direction,
            "vendor_name": "Vendor A",
            "start_date": self.start_date,
            "end_date": self.end_date,
            "created_by": self.user,
        }
        defaults.update(overrides)
        return RentalAgreement.objects.create(**defaults)

    def _create_rented_item(self, agreement, serial_number="R-001"):
        """Create a rented-in equipment item with pending_receipt status."""
        item = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            serial_number=serial_number,
            ownership_type=EquipmentItem.OwnershipType.RENTED_IN,
            rental_agreement=agreement,
            current_status=EquipmentItem.Status.PENDING_RECEIPT,
        )
        EquipmentStatusService.register(item, self.user, rental_agreement=agreement)
        return item


# ─── Service Tests ──────────────────────────────────────────────────────


class RentalActivateTest(RentalTestBase):
    def test_activate_draft(self):
        """Activate a draft agreement."""
        agreement = self._create_agreement()
        result = RentalService.activate(agreement, self.user)
        self.assertEqual(result.status, RentalAgreement.Status.ACTIVE)

    def test_activate_non_draft_fails(self):
        """Cannot activate an already-active agreement."""
        agreement = self._create_agreement(status=RentalAgreement.Status.ACTIVE)
        with self.assertRaises(InvalidRentalOperationError):
            RentalService.activate(agreement, self.user)


class RentalReceiveTest(RentalTestBase):
    def test_receive_to_warehouse(self):
        """Receive items into warehouse — status becomes AVAILABLE."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)

        item = self._create_rented_item(agreement, "R-RCV-001")
        RentalService.receive(
            agreement, self.user, item_uuids=[item.uuid]
        )

        item.refresh_from_db()
        self.assertEqual(item.current_status, EquipmentItem.Status.AVAILABLE)

    def test_receive_non_active_fails(self):
        """Cannot receive for a DRAFT agreement."""
        agreement = self._create_agreement()
        item = self._create_rented_item(agreement, "R-RCV-002")
        with self.assertRaises(InvalidRentalOperationError):
            RentalService.receive(
                agreement, self.user, item_uuids=[item.uuid]
            )


class RentalReturnTest(RentalTestBase):
    def test_return_to_vendor(self):
        """Return items to vendor — deactivates and updates status."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)

        item = self._create_rented_item(agreement, "R-RET-001")
        RentalService.receive(agreement, self.user, item_uuids=[item.uuid])

        RentalService.return_to_vendor(
            agreement, self.user, item_uuids=[item.uuid]
        )

        item.refresh_from_db()
        self.assertEqual(item.current_status, EquipmentItem.Status.RETURNED_TO_VENDOR)
        self.assertFalse(item.is_active)

        agreement.refresh_from_db()
        self.assertEqual(agreement.status, RentalAgreement.Status.COMPLETED)

    def test_partial_return_sets_returning_status(self):
        """Returning some items sets agreement to RETURNING."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)

        item1 = self._create_rented_item(agreement, "R-RET-A")
        item2 = self._create_rented_item(agreement, "R-RET-B")

        # Receive both
        RentalService.receive(
            agreement, self.user, item_uuids=[item1.uuid, item2.uuid]
        )

        # Return only one
        RentalService.return_to_vendor(
            agreement, self.user, item_uuids=[item1.uuid]
        )

        agreement.refresh_from_db()
        self.assertEqual(agreement.status, RentalAgreement.Status.RETURNING)


class RentalExtendTest(RentalTestBase):
    def test_extend_active_agreement(self):
        """Extend the end date of an active agreement."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)

        new_end = self.end_date + timedelta(days=15)
        result = RentalService.extend(
            agreement, self.user, new_end_date=new_end
        )
        self.assertEqual(result.end_date, new_end)

    def test_extend_with_earlier_date_fails(self):
        """Cannot extend to a date before current end date."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)

        with self.assertRaises(InvalidRentalOperationError):
            RentalService.extend(
                agreement,
                self.user,
                new_end_date=self.end_date - timedelta(days=5),
            )


class RentalCancelTest(RentalTestBase):
    def test_cancel_draft_deregisters_items(self):
        """Cancel a draft agreement — pending items are deregistered."""
        agreement = self._create_agreement()
        item = self._create_rented_item(agreement, "R-CAN-001")

        result = RentalService.cancel(agreement, self.user)
        self.assertEqual(result.status, RentalAgreement.Status.CANCELLED)

        item.refresh_from_db()
        self.assertFalse(item.is_active)
        self.assertEqual(item.current_status, EquipmentItem.Status.RETURNED_TO_VENDOR)

    def test_cancel_active_agreement(self):
        """Cancel an active agreement — just changes status."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)
        result = RentalService.cancel(agreement, self.user)
        self.assertEqual(result.status, RentalAgreement.Status.CANCELLED)

    def test_cancel_completed_fails(self):
        """Cannot cancel a completed agreement."""
        agreement = self._create_agreement(status=RentalAgreement.Status.COMPLETED)
        with self.assertRaises(InvalidRentalOperationError):
            RentalService.cancel(agreement, self.user)


# ─── API Tests ──────────────────────────────────────────────────────────


class RentalAgreementCRUDTest(RentalTestBase):
    def test_create_agreement(self):
        """POST /rentals/agreements/ creates a draft agreement."""
        resp = self.client.post(
            "/api/v1/rentals/agreements/",
            {
                "direction": "in",
                "vendor_name": "Test Vendor",
                "start_date": str(self.start_date),
                "end_date": str(self.end_date),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["direction"], "in")
        self.assertEqual(resp.data["vendor_name"], "Test Vendor")
        # Verify the created object in DB
        agreement = RentalAgreement.objects.get(vendor_name="Test Vendor")
        self.assertEqual(agreement.status, RentalAgreement.Status.DRAFT)
        self.assertTrue(agreement.agreement_number.startswith("RA-IN-"))

    def test_list_agreements(self):
        """GET /rentals/agreements/ returns list."""
        self._create_agreement()
        resp = self.client.get("/api/v1/rentals/agreements/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["count"], 1)

    def test_retrieve_agreement(self):
        """GET /rentals/agreements/{uuid}/ returns detail."""
        agreement = self._create_agreement()
        resp = self.client.get(f"/api/v1/rentals/agreements/{agreement.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["vendor_name"], "Vendor A")

    def test_delete_draft_agreement(self):
        """DELETE /rentals/agreements/{uuid}/ deletes a draft agreement."""
        agreement = self._create_agreement()
        resp = self.client.delete(f"/api/v1/rentals/agreements/{agreement.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_delete_active_agreement_fails(self):
        """DELETE on non-draft agreement returns 400."""
        agreement = self._create_agreement(status=RentalAgreement.Status.ACTIVE)
        resp = self.client.delete(f"/api/v1/rentals/agreements/{agreement.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class RentalAgreementLineAPITest(RentalTestBase):
    def test_add_line(self):
        """POST /rentals/agreements/{uuid}/lines/ adds a line."""
        agreement = self._create_agreement()
        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/lines/",
            {
                "equipment_model_uuid": str(self.eq_model.uuid),
                "quantity": 5,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["quantity"], 5)

    def test_add_line_to_active_fails(self):
        """Cannot add lines to non-draft agreement."""
        agreement = self._create_agreement(status=RentalAgreement.Status.ACTIVE)
        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/lines/",
            {
                "equipment_model_uuid": str(self.eq_model.uuid),
                "quantity": 5,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_lines(self):
        """GET /rentals/agreements/{uuid}/lines/ returns lines."""
        agreement = self._create_agreement()
        RentalAgreementLine.objects.create(
            agreement=agreement,
            equipment_model=self.eq_model,
            quantity=3,
        )
        resp = self.client.get(
            f"/api/v1/rentals/agreements/{agreement.uuid}/lines/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)


class RentalLifecycleAPITest(RentalTestBase):
    def test_activate_api(self):
        """POST /rentals/agreements/{uuid}/activate/ transitions to ACTIVE."""
        agreement = self._create_agreement()
        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/activate/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "active")

    def test_extend_api(self):
        """POST /rentals/agreements/{uuid}/extend/ extends end date."""
        agreement = self._create_agreement()
        RentalService.activate(agreement, self.user)

        new_end = self.end_date + timedelta(days=10)
        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/extend/",
            {"new_end_date": str(new_end)},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["end_date"], str(new_end))

    def test_cancel_api(self):
        """POST /rentals/agreements/{uuid}/cancel/ cancels the agreement."""
        agreement = self._create_agreement()
        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/cancel/",
            {"notes": "Not needed"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    def test_receive_api(self):
        """POST /rentals/agreements/{uuid}/receive/ receives items."""
        agreement = self._create_agreement()
        RentalService.activate(agreement, self.user)
        item = self._create_rented_item(agreement, "R-API-001")

        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/receive/",
            {"item_uuids": [str(item.uuid)]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_return_api(self):
        """POST /rentals/agreements/{uuid}/return/ returns items to vendor."""
        agreement = self._create_agreement()
        agreement = RentalService.activate(agreement, self.user)
        item = self._create_rented_item(agreement, "R-API-002")
        RentalService.receive(agreement, self.user, item_uuids=[item.uuid])

        resp = self.client.post(
            f"/api/v1/rentals/agreements/{agreement.uuid}/return/",
            {"item_uuids": [str(item.uuid)]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "completed")

    def test_equipment_list_api(self):
        """GET /rentals/agreements/{uuid}/equipment/ lists agreement items."""
        agreement = self._create_agreement()
        RentalService.activate(agreement, self.user)
        self._create_rented_item(agreement, "R-EQ-001")

        resp = self.client.get(
            f"/api/v1/rentals/agreements/{agreement.uuid}/equipment/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
