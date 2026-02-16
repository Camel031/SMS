from unittest.mock import MagicMock
from uuid import uuid4

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import AuditLog
from .services import AuditService


# ─── Shared base ────────────────────────────────────────────────────────


class AuditTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="audit_admin",
            password="pass123",
            can_view_reports=True,
            can_check_in=True,
            can_manage_equipment=True,
            can_manage_schedules=True,
        )
        self.normal_user = User.objects.create_user(
            username="audit_normal",
            password="pass123",
            can_check_in=True,
        )
        self.client.force_authenticate(user=self.admin)


# ─── Service Tests ──────────────────────────────────────────────────────


class AuditLogServiceTest(AuditTestBase):
    def test_log_creates_entry(self):
        """log() creates an audit log with correct fields."""
        entry = AuditService.log(
            user=self.admin,
            action="Create",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="Created a new item",
            entity_type="equipment_item",
            entity_uuid=uuid4(),
            entity_display="MP-001",
        )
        self.assertEqual(entry.user, self.admin)
        self.assertEqual(entry.action, "Create")
        self.assertEqual(entry.category, "equipment")
        self.assertEqual(entry.description, "Created a new item")
        self.assertEqual(entry.entity_type, "equipment_item")
        self.assertEqual(entry.entity_display, "MP-001")
        self.assertIsNotNone(entry.uuid)

    def test_log_denormalizes_user_display(self):
        """user_display is captured as string representation of user."""
        entry = AuditService.log(
            user=self.admin,
            action="Test",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="Test",
        )
        self.assertEqual(entry.user_display, str(self.admin))

    def test_log_system_action_null_user(self):
        """System actions have user=None and user_display='System'."""
        entry = AuditService.log(
            user=None,
            action="System Cleanup",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="Automated task",
        )
        self.assertIsNone(entry.user)
        self.assertEqual(entry.user_display, "System")

    def test_log_captures_ip_from_remote_addr(self):
        """IP address extracted from REMOTE_ADDR."""
        request = MagicMock()
        request.META = {"REMOTE_ADDR": "192.168.1.100"}

        entry = AuditService.log(
            user=self.admin,
            action="Test",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="IP test",
            request=request,
        )
        self.assertEqual(entry.ip_address, "192.168.1.100")

    def test_log_captures_ip_from_x_forwarded_for(self):
        """IP address prefers X-Forwarded-For header."""
        request = MagicMock()
        request.META = {
            "HTTP_X_FORWARDED_FOR": "10.0.0.1, 10.0.0.2",
            "REMOTE_ADDR": "192.168.1.100",
        }

        entry = AuditService.log(
            user=self.admin,
            action="Test",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="Proxy IP test",
            request=request,
        )
        self.assertEqual(entry.ip_address, "10.0.0.1")

    def test_log_no_request_ip_is_none(self):
        """IP is None when no request provided."""
        entry = AuditService.log(
            user=self.admin,
            action="Test",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="No request",
        )
        self.assertIsNone(entry.ip_address)

    def test_log_stores_changes_json(self):
        """Changes dict is stored as JSON."""
        changes = {"status": {"old": "available", "new": "out"}}
        entry = AuditService.log(
            user=self.admin,
            action="Update",
            category=AuditLog.ActionCategory.EQUIPMENT,
            description="Status changed",
            changes=changes,
        )
        self.assertEqual(entry.changes, changes)


class AuditConvenienceHelpersTest(AuditTestBase):
    def test_log_schedule_action(self):
        """log_schedule_action sets correct category and entity type."""
        schedule = MagicMock()
        schedule.uuid = uuid4()
        schedule.title = "Summer Festival"

        AuditService.log_schedule_action(
            user=self.admin,
            action="Confirm",
            schedule=schedule,
        )

        entry = AuditLog.objects.get(entity_uuid=schedule.uuid)
        self.assertEqual(entry.category, "schedule")
        self.assertEqual(entry.entity_type, "schedule")
        self.assertEqual(entry.entity_display, "Summer Festival")
        self.assertIn("Summer Festival", entry.description)

    def test_log_schedule_action_custom_description(self):
        """Custom description overrides default."""
        schedule = MagicMock()
        schedule.uuid = uuid4()
        schedule.title = "Test"

        AuditService.log_schedule_action(
            user=self.admin,
            action="Confirm",
            schedule=schedule,
            description="Custom text here",
        )

        entry = AuditLog.objects.get(entity_uuid=schedule.uuid)
        self.assertEqual(entry.description, "Custom text here")

    def test_log_equipment_action(self):
        """log_equipment_action sets correct category and supports changes."""
        item = MagicMock()
        item.uuid = uuid4()
        item.__str__ = lambda self: "MP-001"

        changes = {"status": "repaired"}
        AuditService.log_equipment_action(
            user=self.admin,
            action="Repair",
            item=item,
            changes=changes,
        )

        entry = AuditLog.objects.get(entity_uuid=item.uuid)
        self.assertEqual(entry.category, "equipment")
        self.assertEqual(entry.entity_type, "equipment_item")
        self.assertEqual(entry.changes, changes)

    def test_log_warehouse_action(self):
        """log_warehouse_action sets correct category and entity type."""
        txn = MagicMock()
        txn.uuid = uuid4()
        txn.__str__ = lambda self: "Check Out #1"

        AuditService.log_warehouse_action(
            user=self.admin,
            action="Check Out",
            transaction=txn,
        )

        entry = AuditLog.objects.get(entity_uuid=txn.uuid)
        self.assertEqual(entry.category, "warehouse")
        self.assertEqual(entry.entity_type, "warehouse_transaction")

    def test_log_rental_action(self):
        """log_rental_action sets correct category and captures agreement number."""
        agreement = MagicMock()
        agreement.uuid = uuid4()
        agreement.agreement_number = "RA-2025-001"

        AuditService.log_rental_action(
            user=self.admin,
            action="Activate",
            agreement=agreement,
        )

        entry = AuditLog.objects.get(entity_uuid=agreement.uuid)
        self.assertEqual(entry.category, "rental")
        self.assertEqual(entry.entity_type, "rental_agreement")
        self.assertEqual(entry.entity_display, "RA-2025-001")
        self.assertIn("RA-2025-001", entry.description)

    def test_log_transfer_action(self):
        """log_transfer_action sets correct category and entity type."""
        transfer = MagicMock()
        transfer.uuid = uuid4()
        transfer.__str__ = lambda self: "Transfer #1"

        AuditService.log_transfer_action(
            user=self.admin,
            action="Execute",
            transfer=transfer,
        )

        entry = AuditLog.objects.get(entity_uuid=transfer.uuid)
        self.assertEqual(entry.category, "transfer")
        self.assertEqual(entry.entity_type, "equipment_transfer")


# ─── API Tests ──────────────────────────────────────────────────────────


class AuditLogAPITest(AuditTestBase):
    def _create_log(self, **kwargs):
        defaults = {
            "user": self.admin,
            "user_display": str(self.admin),
            "action": "Test",
            "category": AuditLog.ActionCategory.EQUIPMENT,
            "description": "Test entry",
        }
        defaults.update(kwargs)
        return AuditLog.objects.create(**defaults)

    def test_list_requires_can_view_reports(self):
        """GET /audit/ returns 403 without can_view_reports."""
        self.client.force_authenticate(user=self.normal_user)

        resp = self.client.get("/api/v1/audit/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_with_permission(self):
        """GET /audit/ returns entries when user has can_view_reports."""
        self._create_log()
        self._create_log()

        resp = self.client.get("/api/v1/audit/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_list_filter_by_category(self):
        """GET /audit/?category=warehouse filters correctly."""
        self._create_log(category="equipment")
        self._create_log(category="warehouse")

        resp = self.client.get("/api/v1/audit/?category=warehouse")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["category"], "warehouse")

    def test_list_filter_by_action(self):
        """GET /audit/?action=Confirm filters correctly."""
        self._create_log(action="Confirm")
        self._create_log(action="Cancel")

        resp = self.client.get("/api/v1/audit/?action=Confirm")
        self.assertEqual(resp.data["count"], 1)

    def test_list_filter_by_entity_type(self):
        """GET /audit/?entity_type=schedule filters correctly."""
        self._create_log(entity_type="schedule")
        self._create_log(entity_type="warehouse_transaction")

        resp = self.client.get("/api/v1/audit/?entity_type=schedule")
        self.assertEqual(resp.data["count"], 1)

    def test_list_filter_by_user_uuid(self):
        """GET /audit/?user_uuid=... filters by user."""
        self._create_log(user=self.admin, user_display=str(self.admin))
        self._create_log(
            user=self.normal_user, user_display=str(self.normal_user)
        )

        resp = self.client.get(
            f"/api/v1/audit/?user_uuid={self.normal_user.uuid}"
        )
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(
            resp.data["results"][0]["user_display"], str(self.normal_user)
        )

    def test_list_filter_by_entity_uuid(self):
        """GET /audit/?entity_uuid=... filters by entity."""
        target_uuid = uuid4()
        self._create_log(entity_uuid=target_uuid)
        self._create_log(entity_uuid=uuid4())

        resp = self.client.get(f"/api/v1/audit/?entity_uuid={target_uuid}")
        self.assertEqual(resp.data["count"], 1)

    def test_list_search_description(self):
        """GET /audit/?search=keyword searches description."""
        self._create_log(description="Confirmed schedule Summer Festival")
        self._create_log(description="Cancelled transfer")

        resp = self.client.get("/api/v1/audit/?search=Summer")
        self.assertEqual(resp.data["count"], 1)

    def test_list_search_user_display(self):
        """GET /audit/?search=username searches user_display."""
        self._create_log(user_display="John Doe")
        self._create_log(user_display="Jane Smith")

        resp = self.client.get("/api/v1/audit/?search=John")
        self.assertEqual(resp.data["count"], 1)

    def test_list_ordered_newest_first(self):
        """Audit logs are returned newest first by default."""
        self._create_log(description="First")
        self._create_log(description="Second")

        resp = self.client.get("/api/v1/audit/")
        descriptions = [r["description"] for r in resp.data["results"]]
        self.assertEqual(descriptions, ["Second", "First"])

    def test_entity_audit_log(self):
        """GET /audit/{entity_type}/{entity_uuid}/ returns entity-specific logs."""
        target_uuid = uuid4()
        self._create_log(
            entity_type="schedule",
            entity_uuid=target_uuid,
            action="Confirm",
        )
        self._create_log(
            entity_type="schedule",
            entity_uuid=target_uuid,
            action="Begin",
        )
        self._create_log(
            entity_type="schedule",
            entity_uuid=uuid4(),
            action="Cancel",
        )

        resp = self.client.get(f"/api/v1/audit/schedule/{target_uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_entity_audit_log_no_permission_required(self):
        """Entity audit endpoint works without can_view_reports."""
        self.client.force_authenticate(user=self.normal_user)
        target_uuid = uuid4()
        self._create_log(entity_type="schedule", entity_uuid=target_uuid)

        resp = self.client.get(f"/api/v1/audit/schedule/{target_uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_serializer_fields(self):
        """Response includes all expected fields."""
        entry = self._create_log(
            entity_type="schedule",
            entity_uuid=uuid4(),
            entity_display="Summer Festival",
            changes={"status": "confirmed"},
            ip_address="10.0.0.1",
        )

        resp = self.client.get("/api/v1/audit/")
        data = resp.data["results"][0]

        self.assertIn("uuid", data)
        self.assertIn("user_display", data)
        self.assertIn("action", data)
        self.assertIn("category", data)
        self.assertIn("description", data)
        self.assertIn("entity_type", data)
        self.assertIn("entity_uuid", data)
        self.assertIn("entity_display", data)
        self.assertIn("changes", data)
        self.assertIn("ip_address", data)
        self.assertIn("created_at", data)
        self.assertEqual(data["changes"], {"status": "confirmed"})
        self.assertEqual(data["ip_address"], "10.0.0.1")

    def test_unauthenticated_returns_401_or_403(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)

        resp = self.client.get("/api/v1/audit/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])
