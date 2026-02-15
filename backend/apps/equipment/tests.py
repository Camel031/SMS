from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import (
    EquipmentCategory,
    EquipmentItem,
    EquipmentModel,
    EquipmentStatusLog,
    FaultRecord,
)
from .services import EquipmentStatusService, InvalidTransitionError


class EquipmentTestBase(TestCase):
    """Shared setup for equipment tests."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin",
            password="testpass123",
            can_manage_equipment=True,
            is_staff=True,
        )
        self.viewer = User.objects.create_user(
            username="viewer",
            password="testpass123",
        )
        self.category = EquipmentCategory.objects.create(
            name="Moving Head", slug="moving-head"
        )
        self.model = EquipmentModel.objects.create(
            name="MegaPointe",
            brand="Robe",
            model_number="MP-001",
            category=self.category,
            is_numbered=True,
        )
        self.item = EquipmentItem.objects.create(
            equipment_model=self.model,
            serial_number="SN-001",
            internal_id="INT-001",
        )

    def login_admin(self):
        self.client.force_authenticate(user=self.admin)

    def login_viewer(self):
        self.client.force_authenticate(user=self.viewer)


# ─── Category Tests ──────────────────────────────────────────────────


class CategoryAPITest(EquipmentTestBase):
    def test_list_categories(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/categories/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_create_category_requires_permission(self):
        self.login_viewer()
        resp = self.client.post("/api/v1/equipment/categories/", {
            "name": "LED", "slug": "led"
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_category_as_admin(self):
        self.login_admin()
        resp = self.client.post("/api/v1/equipment/categories/", {
            "name": "LED", "slug": "led"
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "LED")

    def test_category_tree(self):
        self.login_viewer()
        sub = EquipmentCategory.objects.create(
            name="Spot", slug="spot", parent=self.category
        )
        resp = self.client.get("/api/v1/equipment/categories/tree/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(len(resp.data[0]["children"]), 1)
        self.assertEqual(resp.data[0]["children"][0]["name"], "Spot")

    def test_category_detail(self):
        self.login_viewer()
        resp = self.client.get(f"/api/v1/equipment/categories/{self.category.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["name"], "Moving Head")

    def test_update_category(self):
        self.login_admin()
        resp = self.client.patch(
            f"/api/v1/equipment/categories/{self.category.uuid}/",
            {"sort_order": 5},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.category.refresh_from_db()
        self.assertEqual(self.category.sort_order, 5)

    def test_filter_root_categories(self):
        self.login_viewer()
        EquipmentCategory.objects.create(
            name="Sub", slug="sub", parent=self.category
        )
        resp = self.client.get("/api/v1/equipment/categories/?parent=null")
        self.assertEqual(resp.data["count"], 1)


# ─── Equipment Model Tests ──────────────────────────────────────────


class EquipmentModelAPITest(EquipmentTestBase):
    def test_list_models(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/models/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_create_model_requires_permission(self):
        self.login_viewer()
        resp = self.client.post("/api/v1/equipment/models/", {
            "name": "Pointe",
            "category": self.category.id,
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_model_as_admin(self):
        self.login_admin()
        resp = self.client.post("/api/v1/equipment/models/", {
            "name": "Pointe",
            "brand": "Robe",
            "category": self.category.id,
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_model_detail_includes_counts(self):
        self.login_viewer()
        resp = self.client.get(f"/api/v1/equipment/models/{self.model.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["item_count"], 1)
        self.assertEqual(resp.data["available_count"], 1)

    def test_numbered_model_rejects_total_quantity(self):
        self.login_admin()
        resp = self.client.post("/api/v1/equipment/models/", {
            "name": "BadModel",
            "category": self.category.id,
            "is_numbered": True,
            "total_quantity": 50,
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_search_models(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/models/?search=Mega")
        self.assertEqual(resp.data["count"], 1)
        resp2 = self.client.get("/api/v1/equipment/models/?search=nonexistent")
        self.assertEqual(resp2.data["count"], 0)


# ─── Equipment Item Tests ───────────────────────────────────────────


class EquipmentItemAPITest(EquipmentTestBase):
    def test_list_items(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/items/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_create_item_registers_status(self):
        self.login_admin()
        resp = self.client.post("/api/v1/equipment/items/", {
            "equipment_model": self.model.id,
            "serial_number": "SN-002",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        new_item = EquipmentItem.objects.get(serial_number="SN-002")
        self.assertEqual(new_item.current_status, EquipmentItem.Status.AVAILABLE)
        self.assertTrue(
            EquipmentStatusLog.objects.filter(
                equipment_item=new_item,
                action=EquipmentStatusLog.Action.REGISTER,
            ).exists()
        )

    def test_create_item_requires_permission(self):
        self.login_viewer()
        resp = self.client.post("/api/v1/equipment/items/", {
            "equipment_model": self.model.id,
            "serial_number": "SN-002",
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_item_detail(self):
        self.login_viewer()
        resp = self.client.get(f"/api/v1/equipment/items/{self.item.uuid}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["serial_number"], "SN-001")

    def test_item_rejects_unnumbered_model(self):
        self.login_admin()
        unnumbered = EquipmentModel.objects.create(
            name="XLR Cable",
            category=self.category,
            is_numbered=False,
            total_quantity=100,
        )
        resp = self.client.post("/api/v1/equipment/items/", {
            "equipment_model": unnumbered.id,
            "serial_number": "CABLE-001",
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_items_by_status(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/items/?status=available")
        self.assertEqual(resp.data["count"], 1)
        resp2 = self.client.get("/api/v1/equipment/items/?status=out")
        self.assertEqual(resp2.data["count"], 0)

    def test_search_items(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/items/?search=SN-001")
        self.assertEqual(resp.data["count"], 1)


# ─── Item History Tests ──────────────────────────────────────────────


class EquipmentItemHistoryTest(EquipmentTestBase):
    def test_item_history(self):
        self.login_viewer()
        # Create a status log entry
        EquipmentStatusLog.objects.create(
            equipment_item=self.item,
            action=EquipmentStatusLog.Action.REGISTER,
            from_status="",
            to_status="available",
            performed_by=self.admin,
        )
        resp = self.client.get(f"/api/v1/equipment/items/{self.item.uuid}/history/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)


# ─── Fault Record Tests ─────────────────────────────────────────────


class FaultRecordAPITest(EquipmentTestBase):
    def test_create_fault_via_item(self):
        self.login_viewer()
        resp = self.client.post(
            f"/api/v1/equipment/items/{self.item.uuid}/fault/",
            {
                "title": "Lamp broken",
                "description": "Lamp shattered during transport",
                "severity": "high",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FaultRecord.objects.count(), 1)
        fault = FaultRecord.objects.first()
        self.assertEqual(fault.equipment_item, self.item)
        self.assertEqual(fault.reported_by, self.viewer)

    def test_list_faults(self):
        self.login_viewer()
        FaultRecord.objects.create(
            equipment_item=self.item,
            reported_by=self.admin,
            title="Test fault",
            description="desc",
            severity="low",
        )
        resp = self.client.get("/api/v1/equipment/faults/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_resolve_fault(self):
        self.login_admin()
        fault = FaultRecord.objects.create(
            equipment_item=self.item,
            reported_by=self.admin,
            title="Test fault",
            description="desc",
            severity="medium",
        )
        resp = self.client.post(
            f"/api/v1/equipment/faults/{fault.uuid}/resolve/",
            {"resolution_notes": "Replaced lamp"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        fault.refresh_from_db()
        self.assertTrue(fault.is_resolved)
        self.assertIsNotNone(fault.resolved_at)
        self.assertEqual(fault.resolved_by, self.admin)

    def test_resolve_already_resolved_fault(self):
        self.login_admin()
        fault = FaultRecord.objects.create(
            equipment_item=self.item,
            reported_by=self.admin,
            title="Already resolved",
            description="desc",
            severity="low",
            is_resolved=True,
        )
        resp = self.client.post(
            f"/api/v1/equipment/faults/{fault.uuid}/resolve/",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_faults_by_severity(self):
        self.login_viewer()
        FaultRecord.objects.create(
            equipment_item=self.item,
            title="Low fault",
            description="d",
            severity="low",
        )
        FaultRecord.objects.create(
            equipment_item=self.item,
            title="High fault",
            description="d",
            severity="high",
        )
        resp = self.client.get("/api/v1/equipment/faults/?severity=high")
        self.assertEqual(resp.data["count"], 1)


# ─── Equipment Status Service Tests ──────────────────────────────────


class EquipmentStatusServiceTest(EquipmentTestBase):
    def test_register_owned_item(self):
        new_item = EquipmentItem.objects.create(
            equipment_model=self.model,
            serial_number="SN-REG",
            ownership_type=EquipmentItem.OwnershipType.OWNED,
        )
        log = EquipmentStatusService.register(new_item, self.admin)
        new_item.refresh_from_db()
        self.assertEqual(new_item.current_status, EquipmentItem.Status.AVAILABLE)
        self.assertEqual(log.action, EquipmentStatusLog.Action.REGISTER)
        self.assertEqual(log.from_status, "")
        self.assertEqual(log.to_status, "available")

    def test_transition_available_to_out(self):
        log = EquipmentStatusService.transition(
            self.item,
            action=EquipmentStatusLog.Action.CHECK_OUT,
            target_status=EquipmentItem.Status.OUT,
            user=self.admin,
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_status, EquipmentItem.Status.OUT)
        self.assertEqual(log.from_status, "available")
        self.assertEqual(log.to_status, "out")

    def test_transition_out_to_available(self):
        self.item.current_status = EquipmentItem.Status.OUT
        self.item.save()
        log = EquipmentStatusService.transition(
            self.item,
            action=EquipmentStatusLog.Action.CHECK_IN,
            target_status=EquipmentItem.Status.AVAILABLE,
            user=self.admin,
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_status, EquipmentItem.Status.AVAILABLE)

    def test_invalid_transition_raises(self):
        # available → pending_receipt is not a valid transition
        with self.assertRaises(InvalidTransitionError):
            EquipmentStatusService.transition(
                self.item,
                action=EquipmentStatusLog.Action.CHECK_IN,
                target_status=EquipmentItem.Status.PENDING_RECEIPT,
                user=self.admin,
            )

    def test_transition_to_terminal_retired(self):
        log = EquipmentStatusService.transition(
            self.item,
            action=EquipmentStatusLog.Action.MARK_RETIRED,
            target_status=EquipmentItem.Status.RETIRED,
            user=self.admin,
        )
        self.item.refresh_from_db()
        self.assertEqual(self.item.current_status, EquipmentItem.Status.RETIRED)
        # Terminal — no further transitions
        with self.assertRaises(InvalidTransitionError):
            EquipmentStatusService.transition(
                self.item,
                action=EquipmentStatusLog.Action.CHECK_OUT,
                target_status=EquipmentItem.Status.OUT,
                user=self.admin,
            )

    def test_transfer_requires_out_status(self):
        with self.assertRaises(InvalidTransitionError):
            EquipmentStatusService.transfer(
                self.item,
                from_schedule=None,
                to_schedule=None,
                transfer=None,
                user=self.admin,
            )


# ─── Inventory Tests ─────────────────────────────────────────────────


class InventoryAPITest(EquipmentTestBase):
    def test_inventory_summary(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/inventory/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("total_items", resp.data)
        self.assertIn("by_status", resp.data)
        self.assertEqual(resp.data["by_status"]["available"], 1)

    def test_inventory_by_status(self):
        self.login_viewer()
        resp = self.client.get("/api/v1/equipment/inventory/by-status/?status=available")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data) > 0)
        self.assertEqual(resp.data[0]["count"], 1)


# ─── Custom Field Tests ──────────────────────────────────────────────


class CustomFieldAPITest(EquipmentTestBase):
    def test_create_custom_field(self):
        self.login_admin()
        resp = self.client.post("/api/v1/custom-fields/definitions/", {
            "name": "DMX Channels",
            "slug": "dmx-channels",
            "field_type": "number",
            "entity_type": "equipment_model",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_custom_field_requires_permission(self):
        self.login_viewer()
        resp = self.client.post("/api/v1/custom-fields/definitions/", {
            "name": "Weight",
            "slug": "weight",
            "field_type": "number",
            "entity_type": "equipment_model",
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_select_field_requires_options(self):
        self.login_admin()
        resp = self.client.post(
            "/api/v1/custom-fields/definitions/",
            {
                "name": "Connector Type",
                "slug": "connector-type",
                "field_type": "select",
                "entity_type": "equipment_item",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_custom_fields_filter_by_entity(self):
        self.login_admin()
        from apps.custom_fields.models import CustomFieldDefinition

        CustomFieldDefinition.objects.create(
            name="Weight",
            slug="weight",
            field_type="number",
            entity_type="equipment_model",
        )
        CustomFieldDefinition.objects.create(
            name="Condition",
            slug="condition",
            field_type="text",
            entity_type="equipment_item",
        )
        resp = self.client.get(
            "/api/v1/custom-fields/definitions/?entity_type=equipment_model"
        )
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["name"], "Weight")
