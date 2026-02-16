from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.equipment.models import EquipmentCategory, EquipmentItem, EquipmentModel

from .models import CheckoutRecord, Schedule, ScheduleEquipment, ScheduleStatusLog
from .services import (
    AvailabilityService,
    InvalidScheduleTransitionError,
    ScheduleStatusService,
)


class ScheduleTestBase(TestCase):
    """Shared setup for all schedule tests."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            password="pass123",
            can_manage_schedules=True,
            can_check_in=True,
            can_check_out=True,
            can_manage_equipment=True,
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

        # Time helpers
        self.start = timezone.now() + timedelta(days=7)
        self.end = timezone.now() + timedelta(days=10)

    def _create_schedule(self, **overrides):
        """Helper to create a schedule via the API and return the response."""
        data = {
            "schedule_type": "event",
            "title": "Test Event",
            "contact_name": "John Doe",
            "contact_phone": "555-1234",
            "start_datetime": self.start.isoformat(),
            "end_datetime": self.end.isoformat(),
            "location": "Main Stage",
        }
        data.update(overrides)
        return self.client.post("/api/v1/schedules/", data, format="json")

    def _create_schedule_obj(self, **overrides):
        """Helper to create a Schedule object directly in the DB."""
        defaults = {
            "schedule_type": "event",
            "title": "Test Event",
            "contact_name": "John Doe",
            "contact_phone": "555-1234",
            "start_datetime": self.start,
            "end_datetime": self.end,
            "location": "Main Stage",
            "created_by": self.user,
        }
        defaults.update(overrides)
        schedule = Schedule.objects.create(**defaults)
        # Create the initial status log (mimics perform_create behaviour)
        ScheduleStatusLog.objects.create(
            schedule=schedule,
            from_status="",
            to_status=schedule.status,
            changed_by=self.user,
            notes="Schedule created",
        )
        return schedule


# ─── 1. Schedule CRUD Tests ──────────────────────────────────────────


class ScheduleCRUDTests(ScheduleTestBase):

    def test_list_schedules(self):
        """Create 2 schedules, GET /schedules/, verify count=2."""
        self._create_schedule_obj(title="Event A")
        self._create_schedule_obj(title="Event B")
        resp = self.client.get("/api/v1/schedules/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_create_schedule(self):
        """POST /schedules/ with valid event data, verify 201."""
        resp = self._create_schedule()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Schedule.objects.count(), 1)
        schedule = Schedule.objects.first()
        self.assertEqual(schedule.title, "Test Event")
        self.assertEqual(schedule.status, Schedule.Status.DRAFT)
        self.assertEqual(schedule.created_by, self.user)

    def test_create_schedule_validates_dates(self):
        """POST with start > end, verify 400."""
        resp = self._create_schedule(
            start_datetime=(self.end + timedelta(days=1)).isoformat(),
            end_datetime=self.start.isoformat(),
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retrieve_schedule(self):
        """GET /schedules/{uuid}/, verify all fields present."""
        schedule = self._create_schedule_obj()
        resp = self.client.get(f"/api/v1/schedules/{schedule.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        expected_fields = [
            "id",
            "uuid",
            "schedule_type",
            "status",
            "title",
            "contact_name",
            "contact_phone",
            "contact_email",
            "start_datetime",
            "end_datetime",
            "expected_return_date",
            "location",
            "notes",
            "created_by",
            "parent",
            "confirmed_at",
            "confirmed_by",
            "started_at",
            "completed_at",
            "cancelled_at",
            "cancelled_by",
            "cancellation_reason",
            "has_conflicts",
            "is_active",
            "dispatch_events",
            "equipment_allocations",
            "created_at",
            "updated_at",
        ]
        for field in expected_fields:
            self.assertIn(field, resp.data, f"Missing field: {field}")

    def test_update_schedule(self):
        """PATCH /schedules/{uuid}/, verify field updated."""
        schedule = self._create_schedule_obj()
        resp = self.client.patch(
            f"/api/v1/schedules/{schedule.uuid}/",
            {"title": "Updated Title"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        schedule.refresh_from_db()
        self.assertEqual(schedule.title, "Updated Title")

    def test_delete_draft_schedule(self):
        """DELETE /schedules/{uuid}/ where status=draft, verify 204."""
        schedule = self._create_schedule_obj()
        self.assertEqual(schedule.status, Schedule.Status.DRAFT)
        resp = self.client.delete(f"/api/v1/schedules/{schedule.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Schedule.objects.count(), 0)

    def test_delete_non_draft_schedule_fails(self):
        """Confirm a schedule, try DELETE, verify 400."""
        schedule = self._create_schedule_obj()
        ScheduleStatusService.confirm(schedule, self.user)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.CONFIRMED)
        resp = self.client.delete(f"/api/v1/schedules/{schedule.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Schedule.objects.count(), 1)


# ─── 2. Schedule Status Tests ────────────────────────────────────────


class ScheduleStatusTests(ScheduleTestBase):

    def test_confirm_schedule(self):
        """POST /schedules/{uuid}/confirm/, verify status becomes 'confirmed'."""
        schedule = self._create_schedule_obj()
        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/confirm/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.CONFIRMED)
        self.assertIsNotNone(schedule.confirmed_at)
        self.assertEqual(schedule.confirmed_by, self.user)

    def test_confirm_requires_contact_for_event(self):
        """Create event without contact_name, try confirm, verify 400."""
        schedule = self._create_schedule_obj(contact_name="")
        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/confirm/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.DRAFT)

    def test_complete_schedule(self):
        """Create confirmed schedule, begin via service, POST complete, verify status."""
        schedule = self._create_schedule_obj()
        ScheduleStatusService.confirm(schedule, self.user)
        schedule.refresh_from_db()
        ScheduleStatusService.begin(schedule, self.user)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.IN_PROGRESS)

        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/complete/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.COMPLETED)
        self.assertIsNotNone(schedule.completed_at)

    def test_complete_with_active_checkouts_fails(self):
        """Create checkout records, try complete, verify 400."""
        schedule = self._create_schedule_obj()
        ScheduleStatusService.confirm(schedule, self.user)
        schedule.refresh_from_db()
        ScheduleStatusService.begin(schedule, self.user)
        schedule.refresh_from_db()

        # Create an equipment allocation and an active checkout
        allocation = ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=self.eq_model,
            quantity_planned=1,
        )
        item = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            serial_number="SN-CHECKOUT-001",
        )
        CheckoutRecord.objects.create(
            schedule_equipment=allocation,
            equipment_item=item,
            quantity=1,
            checked_out_at=timezone.now(),
            checked_out_by=self.user,
        )

        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/complete/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.IN_PROGRESS)

    def test_cancel_schedule(self):
        """POST /schedules/{uuid}/cancel/, verify status becomes 'cancelled'."""
        schedule = self._create_schedule_obj()
        resp = self.client.post(
            f"/api/v1/schedules/{schedule.uuid}/cancel/",
            {"reason": "No longer needed"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.CANCELLED)
        self.assertIsNotNone(schedule.cancelled_at)
        self.assertEqual(schedule.cancelled_by, self.user)
        self.assertEqual(schedule.cancellation_reason, "No longer needed")

    def test_cancel_in_progress_requires_force(self):
        """Begin schedule, try cancel without force, verify 400."""
        schedule = self._create_schedule_obj()
        ScheduleStatusService.confirm(schedule, self.user)
        schedule.refresh_from_db()
        ScheduleStatusService.begin(schedule, self.user)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.IN_PROGRESS)

        # Cancel without force should fail
        resp = self.client.post(
            f"/api/v1/schedules/{schedule.uuid}/cancel/",
            {"reason": "Trying to cancel"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.IN_PROGRESS)

        # Cancel with force should succeed
        resp = self.client.post(
            f"/api/v1/schedules/{schedule.uuid}/cancel/",
            {"reason": "Force cancel", "force": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.CANCELLED)

    def test_reopen_cancelled_schedule(self):
        """Cancel then POST /schedules/{uuid}/reopen/, verify status 'draft'."""
        schedule = self._create_schedule_obj()
        ScheduleStatusService.cancel(schedule, self.user)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.CANCELLED)

        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/reopen/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.DRAFT)
        self.assertIsNone(schedule.cancelled_at)
        self.assertIsNone(schedule.cancelled_by)

    def test_invalid_transition(self):
        """Try to complete a draft schedule, verify 400."""
        schedule = self._create_schedule_obj()
        self.assertEqual(schedule.status, Schedule.Status.DRAFT)
        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/complete/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.DRAFT)


# ─── 3. Schedule Equipment Tests ─────────────────────────────────────


class ScheduleEquipmentTests(ScheduleTestBase):

    def test_add_equipment_to_schedule(self):
        """POST /schedules/{uuid}/equipment/ with equipment_model_uuid and quantity, verify 201."""
        schedule = self._create_schedule_obj()
        resp = self.client.post(
            f"/api/v1/schedules/{schedule.uuid}/equipment/",
            {
                "equipment_model_uuid": str(self.eq_model.uuid),
                "quantity_planned": 5,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ScheduleEquipment.objects.count(), 1)
        allocation = ScheduleEquipment.objects.first()
        self.assertEqual(allocation.equipment_model, self.eq_model)
        self.assertEqual(allocation.quantity_planned, 5)
        self.assertEqual(allocation.schedule, schedule)

    def test_list_schedule_equipment(self):
        """Add 2 equipment allocations, GET, verify count=2."""
        schedule = self._create_schedule_obj()
        second_model = EquipmentModel.objects.create(
            name="Pointe",
            brand="Robe",
            category=self.category,
            is_numbered=True,
        )
        ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=self.eq_model,
            quantity_planned=3,
        )
        ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=second_model,
            quantity_planned=2,
        )
        resp = self.client.get(f"/api/v1/schedules/{schedule.uuid}/equipment/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # pagination_class = None, so response is a flat list
        self.assertEqual(len(resp.data), 2)

    def test_update_equipment_quantity(self):
        """PATCH /schedules/{uuid}/equipment/{pk}/, verify updated."""
        schedule = self._create_schedule_obj()
        allocation = ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=self.eq_model,
            quantity_planned=3,
        )
        resp = self.client.patch(
            f"/api/v1/schedules/{schedule.uuid}/equipment/{allocation.pk}/",
            {
                "equipment_model_uuid": str(self.eq_model.uuid),
                "quantity_planned": 8,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        allocation.refresh_from_db()
        self.assertEqual(allocation.quantity_planned, 8)

    def test_remove_equipment(self):
        """DELETE /schedules/{uuid}/equipment/{pk}/, verify 204."""
        schedule = self._create_schedule_obj()
        allocation = ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=self.eq_model,
            quantity_planned=3,
        )
        resp = self.client.delete(
            f"/api/v1/schedules/{schedule.uuid}/equipment/{allocation.pk}/"
        )
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(ScheduleEquipment.objects.count(), 0)

    def test_duplicate_equipment_model_fails(self):
        """Try adding same model twice, verify 400 (unique_together)."""
        schedule = self._create_schedule_obj()
        # First allocation succeeds
        resp1 = self.client.post(
            f"/api/v1/schedules/{schedule.uuid}/equipment/",
            {
                "equipment_model_uuid": str(self.eq_model.uuid),
                "quantity_planned": 3,
            },
            format="json",
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # Second allocation with same model should fail
        resp2 = self.client.post(
            f"/api/v1/schedules/{schedule.uuid}/equipment/",
            {
                "equipment_model_uuid": str(self.eq_model.uuid),
                "quantity_planned": 2,
            },
            format="json",
        )
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ScheduleEquipment.objects.count(), 1)


# ─── 4. Dispatch Event Tests ─────────────────────────────────────────


class DispatchEventTests(ScheduleTestBase):

    def test_create_dispatch_event(self):
        """POST /schedules/{uuid}/dispatches/ with valid data, verify 201."""
        parent = self._create_schedule_obj(title="Main Event")
        dispatch_start = self.start + timedelta(hours=1)
        dispatch_end = self.end - timedelta(hours=1)
        resp = self.client.post(
            f"/api/v1/schedules/{parent.uuid}/dispatches/",
            {
                "schedule_type": parent.schedule_type,
                "title": "Load-in",
                "start_datetime": dispatch_start.isoformat(),
                "end_datetime": dispatch_end.isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        dispatch = Schedule.objects.get(title="Load-in")
        self.assertEqual(dispatch.parent, parent)
        self.assertEqual(dispatch.schedule_type, parent.schedule_type)
        self.assertEqual(dispatch.created_by, self.user)

    def test_list_dispatch_events(self):
        """Create 2 dispatch events, GET, verify count=2."""
        parent = self._create_schedule_obj(title="Main Event")
        dispatch_start = self.start + timedelta(hours=1)
        dispatch_end = self.end - timedelta(hours=1)
        Schedule.objects.create(
            parent=parent,
            schedule_type=parent.schedule_type,
            title="Load-in",
            start_datetime=dispatch_start,
            end_datetime=dispatch_end,
            created_by=self.user,
        )
        Schedule.objects.create(
            parent=parent,
            schedule_type=parent.schedule_type,
            title="Load-out",
            start_datetime=dispatch_start,
            end_datetime=dispatch_end,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/v1/schedules/{parent.uuid}/dispatches/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_dispatch_type_matches_parent(self):
        """Dispatch events inherit the parent's schedule_type."""
        parent = self._create_schedule_obj(
            title="Rental Event", schedule_type="rental_out"
        )
        dispatch_start = self.start + timedelta(hours=1)
        dispatch_end = self.end - timedelta(hours=1)
        resp = self.client.post(
            f"/api/v1/schedules/{parent.uuid}/dispatches/",
            {
                # schedule_type is overridden by perform_create to match parent
                "schedule_type": "event",
                "title": "Rental Dispatch",
                "start_datetime": dispatch_start.isoformat(),
                "end_datetime": dispatch_end.isoformat(),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        dispatch = Schedule.objects.get(title="Rental Dispatch")
        # Even though we sent "event", the view forces it to the parent's type
        self.assertEqual(dispatch.schedule_type, parent.schedule_type)
        self.assertEqual(dispatch.schedule_type, "rental_out")


# ─── 5. Availability Tests ───────────────────────────────────────────


class AvailabilityTests(ScheduleTestBase):

    def test_model_availability(self):
        """Create model with 10 items, allocate 6 in confirmed schedule, check availability shows 4 confirmed."""
        # Create 10 owned items for the equipment model
        for i in range(10):
            EquipmentItem.objects.create(
                equipment_model=self.eq_model,
                serial_number=f"SN-AVAIL-{i:03d}",
                ownership_type=EquipmentItem.OwnershipType.OWNED,
                current_status=EquipmentItem.Status.AVAILABLE,
                is_active=True,
            )

        # Create a confirmed schedule with 6 allocated
        schedule = self._create_schedule_obj()
        ScheduleStatusService.confirm(schedule, self.user)
        schedule.refresh_from_db()
        ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=self.eq_model,
            quantity_planned=6,
        )

        avail = AvailabilityService.get_model_availability(
            self.eq_model, self.start, self.end
        )
        self.assertEqual(avail["total_owned"], 10)
        self.assertEqual(avail["allocated_by_others"], 6)
        self.assertEqual(avail["confirmed_available"], 4)

    def test_check_availability_endpoint(self):
        """POST /schedules/check-availability/ with requests, verify response format."""
        # Create some items
        for i in range(5):
            EquipmentItem.objects.create(
                equipment_model=self.eq_model,
                serial_number=f"SN-CHECK-{i:03d}",
                ownership_type=EquipmentItem.OwnershipType.OWNED,
                current_status=EquipmentItem.Status.AVAILABLE,
                is_active=True,
            )

        resp = self.client.post(
            "/api/v1/schedules/check-availability/",
            {
                "start_datetime": self.start.isoformat(),
                "end_datetime": self.end.isoformat(),
                "equipment": [
                    {
                        "equipment_model_uuid": str(self.eq_model.uuid),
                        "quantity": 3,
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertIn("has_any_conflict", resp.data)
        self.assertEqual(len(resp.data["results"]), 1)

        result = resp.data["results"][0]
        self.assertIn("equipment_model", result)
        self.assertIn("requested", result)
        self.assertIn("confirmed_available", result)
        self.assertIn("projected_available", result)
        self.assertIn("is_sufficient", result)
        self.assertIn("shortage", result)
        self.assertEqual(result["requested"], 3)
        self.assertTrue(result["is_sufficient"])

    def test_over_allocation_detection(self):
        """Add more equipment than available, verify is_over_allocated flag."""
        # Create 3 items
        for i in range(3):
            EquipmentItem.objects.create(
                equipment_model=self.eq_model,
                serial_number=f"SN-OVER-{i:03d}",
                ownership_type=EquipmentItem.OwnershipType.OWNED,
                current_status=EquipmentItem.Status.AVAILABLE,
                is_active=True,
            )

        # Create a confirmed schedule that allocates all 3
        schedule_a = self._create_schedule_obj(title="Event A")
        ScheduleStatusService.confirm(schedule_a, self.user)
        schedule_a.refresh_from_db()
        ScheduleEquipment.objects.create(
            schedule=schedule_a,
            equipment_model=self.eq_model,
            quantity_planned=3,
        )

        # Create a second confirmed schedule overlapping, requesting 2 (over-allocated)
        schedule_b = self._create_schedule_obj(title="Event B")
        ScheduleStatusService.confirm(schedule_b, self.user)
        schedule_b.refresh_from_db()
        allocation_b = ScheduleEquipment.objects.create(
            schedule=schedule_b,
            equipment_model=self.eq_model,
            quantity_planned=2,
        )

        # Run conflict check
        has_conflict = AvailabilityService.check_conflicts(schedule_b)
        allocation_b.refresh_from_db()
        self.assertTrue(has_conflict)
        self.assertTrue(allocation_b.is_over_allocated)


# ─── 6. Schedule Status Log Tests ────────────────────────────────────


class ScheduleStatusLogTests(ScheduleTestBase):

    def test_status_log_created_on_creation(self):
        """Create schedule via API, verify log entry exists."""
        resp = self._create_schedule()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        schedule = Schedule.objects.first()
        logs = ScheduleStatusLog.objects.filter(schedule=schedule)
        self.assertEqual(logs.count(), 1)
        log = logs.first()
        self.assertEqual(log.from_status, "")
        self.assertEqual(log.to_status, "draft")
        self.assertEqual(log.changed_by, self.user)

    def test_status_log_on_confirm(self):
        """Confirm schedule, verify log entry with from=draft, to=confirmed."""
        schedule = self._create_schedule_obj()
        initial_log_count = ScheduleStatusLog.objects.filter(
            schedule=schedule
        ).count()
        self.assertEqual(initial_log_count, 1)  # creation log

        resp = self.client.post(f"/api/v1/schedules/{schedule.uuid}/confirm/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        logs = ScheduleStatusLog.objects.filter(schedule=schedule).order_by(
            "changed_at"
        )
        self.assertEqual(logs.count(), 2)
        confirm_log = logs.last()
        self.assertEqual(confirm_log.from_status, "draft")
        self.assertEqual(confirm_log.to_status, "confirmed")
        self.assertEqual(confirm_log.changed_by, self.user)


# ─── 7. Checkout Record Endpoint Tests ─────────────────────────────


class ScheduleCheckoutRecordTests(ScheduleTestBase):

    def _setup_checkout(self):
        """Helper: create schedule with allocation and active checkout."""
        schedule = self._create_schedule_obj()
        allocation = ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=self.eq_model,
            quantity_planned=2,
        )
        item = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            serial_number="SN-CR-001",
        )
        record = CheckoutRecord.objects.create(
            schedule_equipment=allocation,
            equipment_item=item,
            quantity=1,
            checked_out_at=timezone.now(),
            checked_out_by=self.user,
        )
        return schedule, allocation, item, record

    def test_list_active_checkout_records(self):
        """GET /schedules/{uuid}/checkout-records/ returns active records."""
        schedule, allocation, item, record = self._setup_checkout()

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["id"], record.id)
        self.assertTrue(resp.data[0]["is_active"])

    def test_returned_records_excluded(self):
        """Returned checkout records are not included in the response."""
        schedule, allocation, item, record = self._setup_checkout()
        # Mark as returned
        record.checked_in_at = timezone.now()
        record.checked_in_by = self.user
        record.quantity_returned = 1
        record.save()

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)

    def test_transferred_records_excluded(self):
        """Transferred checkout records are not included in the response."""
        schedule, allocation, item, record = self._setup_checkout()
        # Mark as transferred
        record.transferred_at = timezone.now()
        record.quantity_transferred = 1
        record.save()

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)

    def test_multiple_records_mixed(self):
        """Only active records appear; returned ones are excluded."""
        schedule, allocation, item1, record1 = self._setup_checkout()

        # Create a second active checkout
        item2 = EquipmentItem.objects.create(
            equipment_model=self.eq_model,
            serial_number="SN-CR-002",
        )
        CheckoutRecord.objects.create(
            schedule_equipment=allocation,
            equipment_item=item2,
            quantity=1,
            checked_out_at=timezone.now(),
            checked_out_by=self.user,
        )

        # Return the first one
        record1.checked_in_at = timezone.now()
        record1.checked_in_by = self.user
        record1.quantity_returned = 1
        record1.save()

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["equipment_item"]["serial_number"], "SN-CR-002")

    def test_serializer_fields(self):
        """Response includes all expected checkout record fields."""
        schedule, allocation, item, record = self._setup_checkout()

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        data = resp.data[0]
        expected = [
            "id", "equipment_item", "equipment_model_name", "quantity",
            "checked_out_at", "checked_out_by", "checked_in_at",
            "checked_in_by", "quantity_returned", "condition_on_return",
            "is_active", "quantity_still_out",
        ]
        for field in expected:
            self.assertIn(field, data, f"Missing field: {field}")

    def test_empty_schedule_returns_empty(self):
        """Schedule with no checkouts returns empty list."""
        schedule = self._create_schedule_obj()

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)

    def test_unauthenticated_returns_error(self):
        """Unauthenticated request is rejected."""
        schedule = self._create_schedule_obj()
        self.client.force_authenticate(user=None)

        resp = self.client.get(
            f"/api/v1/schedules/{schedule.uuid}/checkout-records/"
        )
        self.assertIn(resp.status_code, [401, 403])
