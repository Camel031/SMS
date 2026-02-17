from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.equipment.models import (
    EquipmentCategory,
    EquipmentItem,
    EquipmentModel,
    FaultRecord,
)
from apps.rentals.models import RentalAgreement
from apps.schedules.models import CheckoutRecord, Schedule, ScheduleEquipment
from apps.transfers.models import EquipmentTransfer
from apps.warehouse.models import WarehouseTransaction


# ===========================================================================
# Section 1: Dashboard Summary (existing tests)
# ===========================================================================


class DashboardSummaryTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="dash_user",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
            can_manage_equipment=True,
            can_manage_schedules=True,
        )
        self.client.force_authenticate(user=self.user)

        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting"
        )

    def test_empty_dashboard(self):
        """Dashboard returns zeros when no data exists."""
        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        data = resp.data
        self.assertEqual(data["equipment"]["total_models"], 0)
        self.assertEqual(data["equipment"]["total_items"], 0)
        self.assertEqual(data["equipment"]["items_available"], 0)
        self.assertEqual(data["equipment"]["items_out"], 0)
        self.assertEqual(data["schedules"]["active"], 0)
        self.assertEqual(data["schedules"]["draft"], 0)
        self.assertEqual(data["warehouse"]["pending_confirmations"], 0)
        self.assertEqual(data["rentals"]["active"], 0)
        self.assertEqual(data["rentals"]["draft"], 0)
        self.assertEqual(data["transfers"]["planned"], 0)
        self.assertEqual(data["faults"]["open"], 0)

    def test_equipment_counts(self):
        """Counts active models and items by status."""
        model_a = EquipmentModel.objects.create(
            name="MegaPointe", brand="Robe", category=self.category, is_numbered=True
        )
        EquipmentModel.objects.create(
            name="Inactive", category=self.category, is_active=False
        )

        EquipmentItem.objects.create(
            equipment_model=model_a, internal_id="MP-001",
            current_status=EquipmentItem.Status.AVAILABLE,
        )
        EquipmentItem.objects.create(
            equipment_model=model_a, internal_id="MP-002",
            current_status=EquipmentItem.Status.AVAILABLE,
        )
        EquipmentItem.objects.create(
            equipment_model=model_a, internal_id="MP-003",
            current_status=EquipmentItem.Status.OUT,
        )

        resp = self.client.get("/api/v1/dashboard/summary/")
        eq = resp.data["equipment"]
        self.assertEqual(eq["total_models"], 1)  # inactive excluded
        self.assertEqual(eq["total_items"], 3)
        self.assertEqual(eq["items_available"], 2)
        self.assertEqual(eq["items_out"], 1)

    def test_schedule_counts(self):
        """Counts schedules by status grouping."""
        now = timezone.now()
        base = {
            "contact_name": "Test",
            "start_datetime": now + timedelta(days=1),
            "end_datetime": now + timedelta(days=3),
            "created_by": self.user,
        }
        Schedule.objects.create(title="Draft", status="draft", **base)
        Schedule.objects.create(title="Confirmed", status="confirmed", **base)
        Schedule.objects.create(title="InProgress", status="in_progress", **base)
        Schedule.objects.create(title="Completed", status="completed", **base)

        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.data["schedules"]["active"], 2)  # confirmed + in_progress
        self.assertEqual(resp.data["schedules"]["draft"], 1)

    def test_warehouse_pending_count(self):
        """Counts pending confirmation warehouse transactions."""
        now = timezone.now()
        schedule = Schedule.objects.create(
            title="Test", status="confirmed",
            contact_name="Test",
            start_datetime=now + timedelta(days=1),
            end_datetime=now + timedelta(days=3),
            created_by=self.user,
        )
        WarehouseTransaction.objects.create(
            transaction_type="check_out",
            status="pending_confirmation",
            schedule=schedule,
            performed_by=self.user,
        )
        WarehouseTransaction.objects.create(
            transaction_type="check_out",
            status="confirmed",
            schedule=schedule,
            performed_by=self.user,
        )

        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.data["warehouse"]["pending_confirmations"], 1)

    def test_rental_counts(self):
        """Counts rentals by status grouping."""
        base = {
            "direction": "in",
            "vendor_name": "Vendor A",
            "start_date": date.today(),
            "end_date": date.today() + timedelta(days=30),
            "created_by": self.user,
        }
        RentalAgreement.objects.create(status="draft", **base)
        RentalAgreement.objects.create(status="active", **base)
        RentalAgreement.objects.create(status="returning", **base)
        RentalAgreement.objects.create(status="completed", **base)

        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.data["rentals"]["active"], 2)  # active + returning
        self.assertEqual(resp.data["rentals"]["draft"], 1)

    def test_transfer_planned_count(self):
        """Counts planned transfers."""
        now = timezone.now()
        sched_base = {
            "contact_name": "Test",
            "start_datetime": now + timedelta(days=1),
            "end_datetime": now + timedelta(days=3),
            "created_by": self.user,
        }
        s1 = Schedule.objects.create(title="From", status="in_progress", **sched_base)
        s2 = Schedule.objects.create(title="To", status="confirmed", **sched_base)

        EquipmentTransfer.objects.create(
            from_schedule=s1, to_schedule=s2, status="planned",
            created_by=self.user,
        )
        EquipmentTransfer.objects.create(
            from_schedule=s1, to_schedule=s2, status="executed",
            created_by=self.user,
        )

        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.data["transfers"]["planned"], 1)

    def test_faults_open_count(self):
        """Counts unresolved faults."""
        model = EquipmentModel.objects.create(
            name="Test", category=self.category, is_numbered=True
        )
        item = EquipmentItem.objects.create(
            equipment_model=model, internal_id="T-001",
            current_status=EquipmentItem.Status.AVAILABLE,
        )

        FaultRecord.objects.create(
            equipment_item=item, title="Broken", severity="medium",
            reported_by=self.user, is_resolved=False,
        )
        FaultRecord.objects.create(
            equipment_item=item, title="Fixed", severity="low",
            reported_by=self.user, is_resolved=True,
        )

        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.data["faults"]["open"], 1)

    def test_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)

        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertIn(
            resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_response_structure(self):
        """Response has all expected top-level keys."""
        resp = self.client.get("/api/v1/dashboard/summary/")
        data = resp.data

        for key in ("equipment", "schedules", "warehouse", "rentals", "transfers", "faults"):
            self.assertIn(key, data, f"Missing key: {key}")


# ===========================================================================
# Section 2: Upcoming Schedules
# ===========================================================================


class UpcomingSchedulesTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="upcoming_user", password="pass123",
        )
        self.client.force_authenticate(user=self.user)

        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting"
        )
        self.now = timezone.now()

    def _create_schedule(self, title, sched_status, start_offset_days, end_offset_days, **kwargs):
        return Schedule.objects.create(
            title=title,
            status=sched_status,
            contact_name="Test",
            start_datetime=self.now + timedelta(days=start_offset_days),
            end_datetime=self.now + timedelta(days=end_offset_days),
            created_by=self.user,
            **kwargs,
        )

    def test_returns_schedules_within_7_days(self):
        """Returns schedules starting within the default 7-day window."""
        s1 = self._create_schedule("Soon", "confirmed", 2, 4)
        s2 = self._create_schedule("Later", "confirmed", 10, 12)

        resp = self.client.get("/api/v1/dashboard/upcoming-schedules/")
        self.assertEqual(resp.status_code, 200)
        uuids = [s["uuid"] for s in resp.data]
        self.assertIn(str(s1.uuid), uuids)
        self.assertNotIn(str(s2.uuid), uuids)

    def test_excludes_completed_and_cancelled(self):
        """Completed and cancelled schedules are excluded."""
        self._create_schedule("Completed", "completed", 2, 4)
        self._create_schedule("Cancelled", "cancelled", 2, 4)
        s = self._create_schedule("Active", "confirmed", 2, 4)

        resp = self.client.get("/api/v1/dashboard/upcoming-schedules/")
        uuids = [s["uuid"] for s in resp.data]
        self.assertEqual(len(uuids), 1)
        self.assertEqual(uuids[0], str(s.uuid))

    def test_equipment_summary_counts(self):
        """Equipment summary includes checkout progress."""
        model = EquipmentModel.objects.create(
            name="Light", category=self.category, is_numbered=True,
        )
        item1 = EquipmentItem.objects.create(
            equipment_model=model, internal_id="L-001",
            current_status="available",
        )

        s = self._create_schedule("Concert", "confirmed", 2, 4)
        alloc = ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model, quantity_planned=3,
        )
        CheckoutRecord.objects.create(
            schedule_equipment=alloc, equipment_item=item1,
            quantity=1, checked_out_at=self.now, checked_out_by=self.user,
        )

        resp = self.client.get("/api/v1/dashboard/upcoming-schedules/")
        eq_summary = resp.data[0]["equipment_summary"]
        self.assertEqual(eq_summary["total_planned"], 3)
        self.assertEqual(eq_summary["total_checked_out"], 1)
        self.assertEqual(eq_summary["checkout_progress"], 33)  # 1/3 = 33%

    def test_days_parameter(self):
        """Custom days parameter expands the window."""
        self._create_schedule("Day 10", "confirmed", 10, 12)

        resp = self.client.get("/api/v1/dashboard/upcoming-schedules/?days=14")
        self.assertEqual(len(resp.data), 1)

    def test_excludes_child_events(self):
        """Dispatch events (children) are excluded."""
        parent = self._create_schedule("Parent", "confirmed", 2, 5)
        self._create_schedule("Child", "confirmed", 3, 4, parent=parent)

        resp = self.client.get("/api/v1/dashboard/upcoming-schedules/")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["uuid"], str(parent.uuid))


# ===========================================================================
# Section 3: Attention Items
# ===========================================================================


class AttentionItemsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="attn_user", password="pass123",
        )
        self.client.force_authenticate(user=self.user)

        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting"
        )
        self.now = timezone.now()

    def test_overdue_return_detection(self):
        """Detects in_progress schedules past end_datetime with active checkouts."""
        model = EquipmentModel.objects.create(
            name="Light", category=self.category, is_numbered=True,
        )
        item = EquipmentItem.objects.create(
            equipment_model=model, internal_id="L-001",
            current_status="out",
        )

        s = Schedule.objects.create(
            title="Past Event", status="in_progress",
            contact_name="Test",
            start_datetime=self.now - timedelta(days=5),
            end_datetime=self.now - timedelta(days=1),
            created_by=self.user,
        )
        alloc = ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model, quantity_planned=1,
        )
        CheckoutRecord.objects.create(
            schedule_equipment=alloc, equipment_item=item,
            quantity=1, checked_out_at=self.now - timedelta(days=4),
            checked_out_by=self.user,
        )

        resp = self.client.get("/api/v1/dashboard/attention-items/")
        self.assertEqual(resp.status_code, 200)
        overdue = [i for i in resp.data if i["type"] == "overdue_return"]
        self.assertEqual(len(overdue), 1)
        self.assertEqual(overdue[0]["severity"], "critical")

    def test_critical_fault_appears(self):
        """Unresolved critical faults appear as attention items."""
        model = EquipmentModel.objects.create(
            name="Light", category=self.category, is_numbered=True,
        )
        item = EquipmentItem.objects.create(
            equipment_model=model, internal_id="L-001",
            current_status="available",
        )
        FaultRecord.objects.create(
            equipment_item=item, title="Broken lens",
            description="Cracked", severity="critical",
            reported_by=self.user, is_resolved=False,
        )

        resp = self.client.get("/api/v1/dashboard/attention-items/")
        faults = [i for i in resp.data if i["type"] == "unresolved_fault"]
        self.assertEqual(len(faults), 1)
        self.assertEqual(faults[0]["severity"], "critical")

    def test_expiring_rental_detection(self):
        """Rentals ending within 3 days appear."""
        RentalAgreement.objects.create(
            direction="in", status="active",
            vendor_name="Vendor A",
            start_date=date.today() - timedelta(days=10),
            end_date=date.today() + timedelta(days=2),
            created_by=self.user,
        )

        resp = self.client.get("/api/v1/dashboard/attention-items/")
        expiring = [i for i in resp.data if i["type"] == "expiring_rental"]
        self.assertEqual(len(expiring), 1)
        self.assertEqual(expiring[0]["severity"], "warning")

    def test_severity_ordering(self):
        """Items are sorted by severity weight descending."""
        # Create critical fault
        model = EquipmentModel.objects.create(
            name="Light", category=self.category, is_numbered=True,
        )
        item = EquipmentItem.objects.create(
            equipment_model=model, internal_id="L-001",
            current_status="available",
        )
        FaultRecord.objects.create(
            equipment_item=item, title="Critical fault",
            description="Bad", severity="critical",
            reported_by=self.user, is_resolved=False,
        )

        # Create pending confirmation (low severity)
        s = Schedule.objects.create(
            title="Test", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        WarehouseTransaction.objects.create(
            transaction_type="check_out", status="pending_confirmation",
            schedule=s, performed_by=self.user,
        )

        resp = self.client.get("/api/v1/dashboard/attention-items/")
        self.assertGreaterEqual(len(resp.data), 2)
        # Critical should come before info
        self.assertEqual(resp.data[0]["type"], "unresolved_fault")
        self.assertEqual(resp.data[-1]["type"], "pending_confirmation")

    def test_empty_when_nothing_actionable(self):
        """Returns empty list when nothing requires attention."""
        resp = self.client.get("/api/v1/dashboard/attention-items/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])


# ===========================================================================
# Section 4: Recent Activity
# ===========================================================================


class RecentActivityTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="activity_user", password="pass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_returns_audit_logs(self):
        """Returns AuditLog entries."""
        AuditLog.objects.create(
            user=self.user, user_display="activity_user",
            action="create", category="equipment",
            description="Created equipment model",
            entity_type="equipment_model",
        )

        resp = self.client.get("/api/v1/dashboard/recent-activity/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["action"], "create")

    def test_limit_parameter(self):
        """Limit parameter caps results."""
        for i in range(10):
            AuditLog.objects.create(
                user=self.user, user_display="activity_user",
                action=f"action_{i}", category="equipment",
                description=f"Action {i}",
            )

        resp = self.client.get("/api/v1/dashboard/recent-activity/?limit=5")
        self.assertEqual(len(resp.data), 5)

    def test_ordering_most_recent_first(self):
        """Most recent entries come first."""
        AuditLog.objects.create(
            user=self.user, user_display="user",
            action="first", category="equipment",
            description="First",
        )
        AuditLog.objects.create(
            user=self.user, user_display="user",
            action="second", category="schedule",
            description="Second",
        )

        resp = self.client.get("/api/v1/dashboard/recent-activity/")
        self.assertEqual(resp.data[0]["action"], "second")
        self.assertEqual(resp.data[1]["action"], "first")


# ===========================================================================
# Section 5: Timeline Data
# ===========================================================================


class TimelineDataTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="timeline_user", password="pass123",
        )
        self.client.force_authenticate(user=self.user)

        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting"
        )
        self.now = timezone.now()

    def test_returns_rows_grouped_by_model(self):
        """Timeline returns one row per equipment model."""
        model_a = EquipmentModel.objects.create(
            name="ModelA", category=self.category, is_numbered=False,
            total_quantity=10,
        )
        model_b = EquipmentModel.objects.create(
            name="ModelB", category=self.category, is_numbered=False,
            total_quantity=5,
        )

        s = Schedule.objects.create(
            title="Event1", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model_a, quantity_planned=2,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model_b, quantity_planned=1,
        )

        resp = self.client.get("/api/v1/dashboard/timeline/", {
            "start": (self.now - timedelta(days=1)).isoformat(),
            "end": (self.now + timedelta(days=7)).isoformat(),
        })

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["rows"]), 2)
        model_names = {r["equipment_model"]["name"] for r in resp.data["rows"]}
        self.assertEqual(model_names, {"ModelA", "ModelB"})

    def test_bars_only_for_overlapping_schedules(self):
        """Only schedules overlapping the query range appear as bars."""
        model = EquipmentModel.objects.create(
            name="Model", category=self.category, is_numbered=False,
            total_quantity=10,
        )

        # Schedule within range
        s_in = Schedule.objects.create(
            title="InRange", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s_in, equipment_model=model, quantity_planned=2,
        )

        # Schedule outside range
        s_out = Schedule.objects.create(
            title="OutOfRange", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=30),
            end_datetime=self.now + timedelta(days=32),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s_out, equipment_model=model, quantity_planned=2,
        )

        resp = self.client.get("/api/v1/dashboard/timeline/", {
            "start": self.now.isoformat(),
            "end": (self.now + timedelta(days=7)).isoformat(),
        })

        self.assertEqual(len(resp.data["rows"]), 1)
        self.assertEqual(len(resp.data["rows"][0]["bars"]), 1)
        self.assertEqual(resp.data["rows"][0]["bars"][0]["title"], "InRange")

    def test_include_drafts_toggle(self):
        """Drafts only appear when include_drafts=true."""
        model = EquipmentModel.objects.create(
            name="Model", category=self.category, is_numbered=False,
            total_quantity=10,
        )
        s = Schedule.objects.create(
            title="DraftEvent", status="draft", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model, quantity_planned=2,
        )

        params = {
            "start": self.now.isoformat(),
            "end": (self.now + timedelta(days=7)).isoformat(),
        }

        # Without include_drafts
        resp = self.client.get("/api/v1/dashboard/timeline/", params)
        self.assertEqual(len(resp.data["rows"]), 0)

        # With include_drafts
        resp = self.client.get("/api/v1/dashboard/timeline/", {
            **params, "include_drafts": "true",
        })
        self.assertEqual(len(resp.data["rows"]), 1)

    def test_category_filter(self):
        """Category param filters by equipment category."""
        cat2 = EquipmentCategory.objects.create(name="Audio", slug="audio")

        model_a = EquipmentModel.objects.create(
            name="Light", category=self.category, is_numbered=False,
            total_quantity=10,
        )
        model_b = EquipmentModel.objects.create(
            name="Speaker", category=cat2, is_numbered=False,
            total_quantity=5,
        )

        s = Schedule.objects.create(
            title="Event", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model_a, quantity_planned=2,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model_b, quantity_planned=1,
        )

        resp = self.client.get("/api/v1/dashboard/timeline/", {
            "start": self.now.isoformat(),
            "end": (self.now + timedelta(days=7)).isoformat(),
            "category": str(self.category.uuid),
        })
        self.assertEqual(len(resp.data["rows"]), 1)
        self.assertEqual(resp.data["rows"][0]["equipment_model"]["name"], "Light")

    def test_category_filter_includes_descendants(self):
        """Parent category filter includes descendant category models."""
        child_category = EquipmentCategory.objects.create(
            name="Beam", slug="beam", parent=self.category
        )
        model_parent = EquipmentModel.objects.create(
            name="ParentLight", category=self.category, is_numbered=False,
            total_quantity=10,
        )
        model_child = EquipmentModel.objects.create(
            name="ChildBeam", category=child_category, is_numbered=False,
            total_quantity=5,
        )

        s = Schedule.objects.create(
            title="Event", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model_parent, quantity_planned=2,
        )
        ScheduleEquipment.objects.create(
            schedule=s, equipment_model=model_child, quantity_planned=1,
        )

        resp = self.client.get("/api/v1/dashboard/timeline/", {
            "start": self.now.isoformat(),
            "end": (self.now + timedelta(days=7)).isoformat(),
            "category": str(self.category.uuid),
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["rows"]), 2)
        names = {row["equipment_model"]["name"] for row in resp.data["rows"]}
        self.assertEqual(names, {"ParentLight", "ChildBeam"})

    def test_missing_params_returns_400(self):
        """Missing start/end returns 400."""
        resp = self.client.get("/api/v1/dashboard/timeline/")
        self.assertEqual(resp.status_code, 400)


# ===========================================================================
# Section 6: Timeline Conflicts
# ===========================================================================


class TimelineConflictsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="conflict_user", password="pass123",
        )
        self.client.force_authenticate(user=self.user)

        self.category = EquipmentCategory.objects.create(
            name="Lighting", slug="lighting"
        )
        self.now = timezone.now()

    def test_returns_over_allocated_only(self):
        """Only over-allocated schedule equipment is returned."""
        model = EquipmentModel.objects.create(
            name="Light", category=self.category, is_numbered=False,
            total_quantity=5,
        )

        s1 = Schedule.objects.create(
            title="Normal", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=1),
            end_datetime=self.now + timedelta(days=3),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s1, equipment_model=model, quantity_planned=2,
            is_over_allocated=False,
        )

        s2 = Schedule.objects.create(
            title="OverAllocated", status="confirmed", contact_name="Test",
            start_datetime=self.now + timedelta(days=2),
            end_datetime=self.now + timedelta(days=4),
            created_by=self.user,
        )
        ScheduleEquipment.objects.create(
            schedule=s2, equipment_model=model, quantity_planned=4,
            is_over_allocated=True,
        )

        resp = self.client.get("/api/v1/dashboard/timeline/conflicts/", {
            "start": self.now.isoformat(),
            "end": (self.now + timedelta(days=7)).isoformat(),
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["schedule_title"], "OverAllocated")
