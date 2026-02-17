from datetime import timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import (
    DEFAULT_PREFERENCES,
    Notification,
    NotificationEventType,
    UserNotificationPreference,
)
from .services import NotificationService


# ─── Shared base ────────────────────────────────────────────────────────


class NotificationTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="notif_user",
            password="pass123",
            can_check_in=True,
            can_check_out=True,
        )
        self.user2 = User.objects.create_user(
            username="notif_user2",
            password="pass123",
            can_check_in=True,
            can_manage_equipment=True,
        )
        self.user3 = User.objects.create_user(
            username="notif_user3",
            password="pass123",
            can_check_in=True,
            can_manage_equipment=True,
        )
        self.client.force_authenticate(user=self.user)


# ─── Service Tests ──────────────────────────────────────────────────────


class NotifyServiceTest(NotificationTestBase):
    def test_notify_creates_notification(self):
        """notify() creates a single notification with correct fields."""
        n = NotificationService.notify(
            recipient=self.user,
            category=Notification.Category.WAREHOUSE,
            title="Test Title",
            message="Test body",
            severity=Notification.Severity.WARNING,
            entity_type="warehouse_transaction",
            entity_uuid=uuid4(),
            actor=self.user2,
        )
        self.assertEqual(n.recipient, self.user)
        self.assertEqual(n.category, "warehouse")
        self.assertEqual(n.severity, "warning")
        self.assertEqual(n.title, "Test Title")
        self.assertEqual(n.message, "Test body")
        self.assertFalse(n.is_read)
        self.assertIsNotNone(n.uuid)
        self.assertEqual(n.actor, self.user2)

    def test_notify_defaults_to_info_severity(self):
        """Severity defaults to 'info' when not specified."""
        n = NotificationService.notify(
            recipient=self.user,
            category=Notification.Category.SYSTEM,
            title="Info",
            message="Default severity",
        )
        self.assertEqual(n.severity, "info")

    def test_notify_many_bulk_creates(self):
        """notify_many() creates notifications for all recipients."""
        recipients = [self.user, self.user2, self.user3]
        results = NotificationService.notify_many(
            recipients=recipients,
            category=Notification.Category.SCHEDULE,
            title="Bulk Test",
            message="Goes to everyone",
        )
        self.assertEqual(len(results), 3)
        self.assertEqual(
            Notification.objects.filter(title="Bulk Test").count(), 3
        )

    def test_notify_many_with_queryset(self):
        """notify_many() works with a QuerySet of users."""
        qs = User.objects.filter(can_check_in=True)
        results = NotificationService.notify_many(
            recipients=qs,
            category=Notification.Category.EQUIPMENT,
            title="QS Test",
            message="From queryset",
        )
        self.assertEqual(len(results), qs.count())


class WarehouseTriggerTest(NotificationTestBase):
    def _mock_transaction(self, *, performer=None, schedule=None):
        txn = MagicMock()
        txn.uuid = uuid4()
        txn.get_transaction_type_display.return_value = "Check Out"
        txn.performed_by = performer or self.user
        txn.schedule = schedule
        return txn

    def test_on_warehouse_pending_notifies_confirmers(self):
        """on_warehouse_pending notifies users with can_check_in, excluding performer."""
        txn = self._mock_transaction(performer=self.user)

        NotificationService.on_warehouse_pending(txn, self.user)

        # user2 and user3 have can_check_in=True, user (performer) excluded
        notifications = Notification.objects.filter(
            entity_type="warehouse_transaction", entity_uuid=txn.uuid
        )
        recipients = set(notifications.values_list("recipient_id", flat=True))
        self.assertIn(self.user2.pk, recipients)
        self.assertIn(self.user3.pk, recipients)
        self.assertNotIn(self.user.pk, recipients)

    def test_on_warehouse_pending_severity_is_warning(self):
        """Pending warehouse notifications have warning severity."""
        txn = self._mock_transaction()
        NotificationService.on_warehouse_pending(txn, self.user)
        n = Notification.objects.filter(entity_uuid=txn.uuid).first()
        self.assertEqual(n.severity, "warning")

    def test_on_warehouse_pending_with_schedule(self):
        """When transaction has a schedule, it's included in the message."""
        schedule = MagicMock()
        schedule.title = "Summer Festival"
        txn = self._mock_transaction(schedule=schedule)

        NotificationService.on_warehouse_pending(txn, self.user)

        n = Notification.objects.filter(entity_uuid=txn.uuid).first()
        self.assertIn("Summer Festival", n.message)

    def test_on_warehouse_confirmed_notifies_performer(self):
        """on_warehouse_confirmed notifies the transaction performer."""
        txn = self._mock_transaction(performer=self.user)

        NotificationService.on_warehouse_confirmed(txn, self.user2)

        n = Notification.objects.get(entity_uuid=txn.uuid)
        self.assertEqual(n.recipient, self.user)
        self.assertEqual(n.actor, self.user2)
        self.assertIn("confirmed", n.title.lower())

    def test_on_warehouse_cancelled_notifies_performer(self):
        """on_warehouse_cancelled notifies the performer with warning severity."""
        txn = self._mock_transaction(performer=self.user)

        NotificationService.on_warehouse_cancelled(txn, self.user2)

        n = Notification.objects.get(entity_uuid=txn.uuid)
        self.assertEqual(n.recipient, self.user)
        self.assertEqual(n.severity, "warning")
        self.assertIn("cancelled", n.title.lower())


class ScheduleTriggerTest(NotificationTestBase):
    def _mock_schedule(self, *, created_by=None):
        s = MagicMock()
        s.uuid = uuid4()
        s.title = "Test Schedule"
        s.created_by = created_by or self.user
        return s

    def test_on_schedule_status_change_notifies_creator(self):
        """Creator receives notification when someone else changes status."""
        schedule = self._mock_schedule(created_by=self.user)

        NotificationService.on_schedule_status_change(
            schedule, "confirmed", changed_by=self.user2
        )

        n = Notification.objects.get(entity_uuid=schedule.uuid)
        self.assertEqual(n.recipient, self.user)
        self.assertEqual(n.category, "schedule")
        self.assertIn("confirmed", n.title.lower())
        self.assertEqual(n.actor, self.user2)

    def test_on_schedule_status_change_skips_self_action(self):
        """No notification when the creator changes their own schedule."""
        schedule = self._mock_schedule(created_by=self.user)

        NotificationService.on_schedule_status_change(
            schedule, "confirmed", changed_by=self.user
        )

        self.assertEqual(
            Notification.objects.filter(entity_uuid=schedule.uuid).count(), 0
        )

    def test_on_schedule_status_change_skips_no_creator(self):
        """No notification when schedule has no creator."""
        schedule = self._mock_schedule()
        schedule.created_by = None

        NotificationService.on_schedule_status_change(
            schedule, "confirmed", changed_by=self.user2
        )

        self.assertEqual(Notification.objects.count(), 0)


class FaultTriggerTest(NotificationTestBase):
    def _mock_fault(self, *, severity="medium"):
        fault = MagicMock()
        fault.uuid = uuid4()
        fault.title = "Lens cracked"
        fault.severity = severity
        fault.get_severity_display.return_value = severity.capitalize()
        item = MagicMock()
        item.uuid = uuid4()
        item.__str__ = lambda self: "MP-001"
        fault.equipment_item = item
        return fault

    def test_on_fault_reported_notifies_managers(self):
        """Fault notifications go to equipment managers, excluding reporter."""
        fault = self._mock_fault()

        NotificationService.on_fault_reported(fault, self.user)

        notifications = Notification.objects.filter(category="equipment")
        recipients = set(notifications.values_list("recipient_id", flat=True))
        # user2 and user3 have can_manage_equipment
        self.assertIn(self.user2.pk, recipients)
        self.assertIn(self.user3.pk, recipients)
        self.assertNotIn(self.user.pk, recipients)

    def test_on_fault_reported_high_severity_is_error(self):
        """High/critical faults produce error-severity notifications."""
        fault = self._mock_fault(severity="high")

        NotificationService.on_fault_reported(fault, self.user)

        n = Notification.objects.first()
        self.assertEqual(n.severity, "error")

    def test_on_fault_reported_low_severity_is_warning(self):
        """Normal faults produce warning-severity notifications."""
        fault = self._mock_fault(severity="medium")

        NotificationService.on_fault_reported(fault, self.user)

        n = Notification.objects.first()
        self.assertEqual(n.severity, "warning")


class RentalTriggerTest(NotificationTestBase):
    def _mock_agreement(self, *, created_by=None):
        a = MagicMock()
        a.uuid = uuid4()
        a.agreement_number = "RA-2025-001"
        a.created_by = created_by or self.user
        return a

    def test_on_rental_status_change_notifies_creator(self):
        """Creator receives notification when someone else changes rental status."""
        agreement = self._mock_agreement(created_by=self.user)

        NotificationService.on_rental_status_change(
            agreement, "activated", changed_by=self.user2
        )

        n = Notification.objects.get(entity_uuid=agreement.uuid)
        self.assertEqual(n.recipient, self.user)
        self.assertEqual(n.category, "rental")
        self.assertIn("RA-2025-001", n.message)

    def test_on_rental_status_change_skips_self_action(self):
        """No notification when creator changes their own rental."""
        agreement = self._mock_agreement(created_by=self.user)

        NotificationService.on_rental_status_change(
            agreement, "activated", changed_by=self.user
        )

        self.assertEqual(Notification.objects.count(), 0)


class TransferTriggerTest(NotificationTestBase):
    def _mock_transfer(self, *, from_creator=None, to_creator=None):
        t = MagicMock()
        t.uuid = uuid4()
        from_sched = MagicMock()
        from_sched.title = "Schedule A"
        from_sched.created_by = from_creator
        to_sched = MagicMock()
        to_sched.title = "Schedule B"
        to_sched.created_by = to_creator
        t.from_schedule = from_sched
        t.to_schedule = to_sched
        return t

    def test_on_transfer_executed_notifies_both_owners(self):
        """Both schedule owners are notified (except performer)."""
        transfer = self._mock_transfer(
            from_creator=self.user2, to_creator=self.user3
        )

        NotificationService.on_transfer_executed(transfer, self.user)

        self.assertEqual(Notification.objects.count(), 2)
        recipients = set(
            Notification.objects.values_list("recipient_id", flat=True)
        )
        self.assertIn(self.user2.pk, recipients)
        self.assertIn(self.user3.pk, recipients)

    def test_on_transfer_executed_excludes_performer(self):
        """Performer is excluded from notifications."""
        transfer = self._mock_transfer(
            from_creator=self.user, to_creator=self.user2
        )

        NotificationService.on_transfer_executed(transfer, self.user)

        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(
            Notification.objects.first().recipient, self.user2
        )

    def test_on_transfer_executed_deduplicates_same_owner(self):
        """If both schedules have the same owner, only one notification sent."""
        transfer = self._mock_transfer(
            from_creator=self.user2, to_creator=self.user2
        )

        NotificationService.on_transfer_executed(transfer, self.user)

        self.assertEqual(Notification.objects.count(), 1)

    def test_on_transfer_executed_no_creators(self):
        """No notifications if schedules have no creators."""
        transfer = self._mock_transfer(from_creator=None, to_creator=None)

        NotificationService.on_transfer_executed(transfer, self.user)

        self.assertEqual(Notification.objects.count(), 0)


# ─── API Tests ──────────────────────────────────────────────────────────


class NotificationAPITest(NotificationTestBase):
    def _create_notification(self, **kwargs):
        defaults = {
            "recipient": self.user,
            "category": Notification.Category.WAREHOUSE,
            "title": "Test",
            "message": "Test message",
        }
        defaults.update(kwargs)
        return Notification.objects.create(**defaults)

    def test_list_notifications(self):
        """GET /notifications/ returns current user's notifications."""
        self._create_notification()
        self._create_notification(recipient=self.user2)  # other user's

        resp = self.client.get("/api/v1/notifications/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)

    def test_list_filter_by_category(self):
        """GET /notifications/?category=schedule filters correctly."""
        self._create_notification(category="warehouse")
        self._create_notification(category="schedule")

        resp = self.client.get("/api/v1/notifications/?category=schedule")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["category"], "schedule")

    def test_list_filter_by_is_read(self):
        """GET /notifications/?is_read=false returns unread only."""
        self._create_notification(is_read=False)
        self._create_notification(is_read=True)

        resp = self.client.get("/api/v1/notifications/?is_read=false")
        self.assertEqual(resp.data["count"], 1)
        self.assertFalse(resp.data["results"][0]["is_read"])

    def test_unread_count(self):
        """GET /notifications/unread-count/ returns count of unread."""
        self._create_notification(is_read=False)
        self._create_notification(is_read=False)
        self._create_notification(is_read=True)

        resp = self.client.get("/api/v1/notifications/unread-count/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 2)

    def test_unread_count_excludes_other_users(self):
        """Unread count only counts current user's notifications."""
        self._create_notification(is_read=False)
        self._create_notification(recipient=self.user2, is_read=False)

        resp = self.client.get("/api/v1/notifications/unread-count/")
        self.assertEqual(resp.data["count"], 1)

    def test_mark_read(self):
        """POST /notifications/{uuid}/read/ marks notification as read."""
        n = self._create_notification(is_read=False)

        resp = self.client.post(f"/api/v1/notifications/{n.uuid}/read/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["is_read"])
        self.assertIsNotNone(resp.data["read_at"])

        n.refresh_from_db()
        self.assertTrue(n.is_read)
        self.assertIsNotNone(n.read_at)

    def test_mark_read_idempotent(self):
        """Marking an already-read notification is a no-op."""
        n = self._create_notification(is_read=True, read_at=timezone.now())

        resp = self.client.post(f"/api/v1/notifications/{n.uuid}/read/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_mark_read_other_users_notification_404(self):
        """Cannot mark another user's notification as read."""
        n = self._create_notification(recipient=self.user2)

        resp = self.client.post(f"/api/v1/notifications/{n.uuid}/read/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_mark_read_nonexistent_uuid_404(self):
        """Non-existent UUID returns 404."""
        fake_uuid = uuid4()
        resp = self.client.post(f"/api/v1/notifications/{fake_uuid}/read/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_mark_all_read(self):
        """POST /notifications/mark-all-read/ marks all unread as read."""
        self._create_notification(is_read=False)
        self._create_notification(is_read=False)
        self._create_notification(is_read=True)

        resp = self.client.post("/api/v1/notifications/mark-all-read/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["marked"], 2)

        self.assertEqual(
            Notification.objects.filter(
                recipient=self.user, is_read=False
            ).count(),
            0,
        )

    def test_mark_all_read_does_not_affect_other_users(self):
        """mark-all-read only affects the current user."""
        self._create_notification(is_read=False)
        self._create_notification(recipient=self.user2, is_read=False)

        self.client.post("/api/v1/notifications/mark-all-read/")

        # user2's notification should still be unread
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.user2, is_read=False
            ).count(),
            1,
        )

    def test_serializer_actor_name_full_name(self):
        """actor_name returns full name when available."""
        self.user2.first_name = "John"
        self.user2.last_name = "Doe"
        self.user2.save()

        self._create_notification(actor=self.user2)

        resp = self.client.get("/api/v1/notifications/")
        self.assertEqual(resp.data["results"][0]["actor_name"], "John Doe")

    def test_serializer_actor_name_username_fallback(self):
        """actor_name falls back to username when no full name."""
        self._create_notification(actor=self.user2)

        resp = self.client.get("/api/v1/notifications/")
        self.assertEqual(
            resp.data["results"][0]["actor_name"], "notif_user2"
        )

    def test_serializer_actor_name_empty_when_no_actor(self):
        """actor_name is empty string when no actor."""
        self._create_notification()

        resp = self.client.get("/api/v1/notifications/")
        self.assertEqual(resp.data["results"][0]["actor_name"], "")

    def test_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)

        resp = self.client.get("/api/v1/notifications/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ─── Preference API Tests ───────────────────────────────────────────────


class PreferenceAPITest(NotificationTestBase):
    def test_get_returns_full_matrix_with_defaults(self):
        """GET /preferences/ returns all event types and channels with defaults."""
        resp = self.client.get("/api/v1/notifications/preferences/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["event_types"]), 10)
        self.assertEqual(len(resp.data["channels"]), 2)

        # in_app defaults to True for all events
        for evt in NotificationEventType.values:
            self.assertTrue(resp.data["preferences"][evt]["in_app"])

    def test_get_reflects_user_overrides(self):
        """GET returns overridden values instead of defaults."""
        UserNotificationPreference.objects.create(
            user=self.user,
            event_type="upcoming_event",
            channel="in_app",
            is_enabled=False,
        )
        resp = self.client.get("/api/v1/notifications/preferences/")
        self.assertFalse(resp.data["preferences"]["upcoming_event"]["in_app"])

    def test_patch_toggles_single_preference(self):
        """PATCH /preferences/ creates/updates a single preference."""
        resp = self.client.patch(
            "/api/v1/notifications/preferences/",
            {"event_type": "fault_reported", "channel": "email", "is_enabled": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["preferences"]["fault_reported"]["email"])

        # Verify DB
        pref = UserNotificationPreference.objects.get(
            user=self.user, event_type="fault_reported", channel="email",
        )
        self.assertFalse(pref.is_enabled)

    def test_patch_upsert_updates_existing(self):
        """PATCH updates existing preference instead of creating duplicate."""
        UserNotificationPreference.objects.create(
            user=self.user,
            event_type="system",
            channel="email",
            is_enabled=True,
        )
        resp = self.client.patch(
            "/api/v1/notifications/preferences/",
            {"event_type": "system", "channel": "email", "is_enabled": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            UserNotificationPreference.objects.filter(
                user=self.user, event_type="system", channel="email",
            ).count(),
            1,
        )

    def test_patch_invalid_event_type(self):
        """PATCH with invalid event_type returns 400."""
        resp = self.client.patch(
            "/api/v1/notifications/preferences/",
            {"event_type": "invalid", "channel": "email", "is_enabled": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_toggle_sets_entire_column(self):
        """PATCH /preferences/bulk/ sets all event types for a channel."""
        resp = self.client.patch(
            "/api/v1/notifications/preferences/bulk/",
            {"channel": "email", "is_enabled": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for evt in NotificationEventType.values:
            self.assertTrue(resp.data["preferences"][evt]["email"])

        # Verify DB has 10 rows
        self.assertEqual(
            UserNotificationPreference.objects.filter(
                user=self.user, channel="email",
            ).count(),
            10,
        )

    def test_reset_deletes_all_preferences(self):
        """POST /preferences/reset/ deletes all overrides."""
        UserNotificationPreference.objects.create(
            user=self.user, event_type="system", channel="email", is_enabled=False,
        )
        UserNotificationPreference.objects.create(
            user=self.user, event_type="system", channel="in_app", is_enabled=False,
        )

        resp = self.client.post("/api/v1/notifications/preferences/reset/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["deleted"], 2)
        self.assertEqual(
            UserNotificationPreference.objects.filter(user=self.user).count(), 0,
        )

    def test_preferences_unauthenticated(self):
        """Unauthenticated requests to preferences return 401."""
        self.client.force_authenticate(user=None)
        resp = self.client.get("/api/v1/notifications/preferences/")
        self.assertIn(resp.status_code, [
            status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN,
        ])


# ─── Preference-aware Dispatch Tests ────────────────────────────────────


class PreferenceDispatchTest(NotificationTestBase):
    def test_notify_with_event_type_creates_by_default(self):
        """notify() with event_type creates notification when in_app default is True."""
        n = NotificationService.notify(
            recipient=self.user,
            category="system",
            title="Test",
            message="Test",
            event_type="system",
        )
        self.assertIsNotNone(n)
        self.assertEqual(Notification.objects.filter(recipient=self.user).count(), 1)

    def test_notify_skips_in_app_when_disabled(self):
        """notify() skips notification creation when in_app is disabled."""
        UserNotificationPreference.objects.create(
            user=self.user, event_type="system", channel="in_app", is_enabled=False,
        )
        n = NotificationService.notify(
            recipient=self.user,
            category="system",
            title="Test",
            message="Test",
            event_type="system",
        )
        self.assertIsNone(n)
        self.assertEqual(Notification.objects.filter(recipient=self.user).count(), 0)

    @patch("apps.notifications.tasks.send_notification_email")
    def test_notify_queues_email_when_enabled(self, mock_email_task):
        """notify() queues email task when email channel is enabled."""
        self.user.email = "test@example.com"
        self.user.save()

        # system event has email=True by default
        NotificationService.notify(
            recipient=self.user,
            category="system",
            title="Email Test",
            message="Body",
            event_type="system",
        )
        mock_email_task.delay.assert_called_once_with(
            "test@example.com", "Email Test", "Body",
        )

    @patch("apps.notifications.tasks.send_notification_email")
    def test_notify_skips_email_when_disabled(self, mock_email_task):
        """notify() does not queue email when email channel is disabled."""
        self.user.email = "test@example.com"
        self.user.save()

        # upcoming_event has email=False by default
        NotificationService.notify(
            recipient=self.user,
            category="schedule",
            title="No Email",
            message="Body",
            event_type="upcoming_event",
        )
        mock_email_task.delay.assert_not_called()

    def test_notify_without_event_type_always_creates(self):
        """notify() without event_type always creates (backward compat)."""
        n = NotificationService.notify(
            recipient=self.user,
            category="system",
            title="Legacy",
            message="Always",
        )
        self.assertIsNotNone(n)
        self.assertEqual(Notification.objects.filter(title="Legacy").count(), 1)

    @patch("apps.notifications.tasks.send_notification_email")
    def test_notify_many_respects_per_recipient_prefs(self, mock_email_task):
        """notify_many() checks preferences per recipient."""
        self.user.email = "u1@example.com"
        self.user.save()
        self.user2.email = "u2@example.com"
        self.user2.save()

        # user1: disable in_app for fault_reported
        UserNotificationPreference.objects.create(
            user=self.user, event_type="fault_reported", channel="in_app",
            is_enabled=False,
        )

        results = NotificationService.notify_many(
            recipients=[self.user, self.user2],
            category="equipment",
            title="Fault",
            message="Test",
            event_type="fault_reported",
        )

        # Only user2 should get in_app notification
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].recipient, self.user2)

        # Both should get email (fault_reported has email=True by default)
        self.assertEqual(mock_email_task.delay.call_count, 2)


# ─── Event Emission Integration Tests ───────────────────────────────────


class EventEmissionIntegrationTest(NotificationTestBase):
    def test_complete_external_repair_emits_repair_completed_notifications(self):
        from apps.schedules.models import Schedule
        from apps.schedules.services import ScheduleStatusService

        now = timezone.now()
        repair = Schedule.objects.create(
            schedule_type=Schedule.ScheduleType.EXTERNAL_REPAIR,
            status=Schedule.Status.IN_PROGRESS,
            title="Projector Repair",
            start_datetime=now - timedelta(days=5),
            end_datetime=now - timedelta(days=1),
            created_by=self.user,
        )

        ScheduleStatusService.complete(repair, self.user2)

        notifications = Notification.objects.filter(
            category=Notification.Category.SCHEDULE,
            entity_type="schedule",
            entity_uuid=repair.uuid,
            title__startswith="Repair completed:",
        )
        recipients = set(notifications.values_list("recipient_id", flat=True))
        self.assertIn(self.user3.pk, recipients)

    def test_new_conflict_emits_equipment_conflict_notifications(self):
        from apps.equipment.models import EquipmentCategory, EquipmentItem, EquipmentModel
        from apps.schedules.models import Schedule, ScheduleEquipment
        from apps.schedules.services import AvailabilityService

        category = EquipmentCategory.objects.create(
            name="Lighting",
            slug="lighting",
        )
        model = EquipmentModel.objects.create(
            name="MegaPointe",
            category=category,
            is_numbered=True,
        )
        for i in range(3):
            EquipmentItem.objects.create(
                equipment_model=model,
                serial_number=f"CONFLICT-{i:03d}",
            )

        now = timezone.now()
        schedule_a = Schedule.objects.create(
            schedule_type=Schedule.ScheduleType.EVENT,
            status=Schedule.Status.CONFIRMED,
            title="Event A",
            start_datetime=now + timedelta(days=1),
            end_datetime=now + timedelta(days=2),
            created_by=self.user,
        )
        schedule_b = Schedule.objects.create(
            schedule_type=Schedule.ScheduleType.EVENT,
            status=Schedule.Status.CONFIRMED,
            title="Event B",
            start_datetime=now + timedelta(days=1, hours=2),
            end_datetime=now + timedelta(days=2, hours=2),
            created_by=self.user,
        )

        ScheduleEquipment.objects.create(
            schedule=schedule_a,
            equipment_model=model,
            quantity_planned=3,
        )
        ScheduleEquipment.objects.create(
            schedule=schedule_b,
            equipment_model=model,
            quantity_planned=2,
        )

        has_conflict = AvailabilityService.check_conflicts(schedule_b)
        self.assertTrue(has_conflict)

        notifications = Notification.objects.filter(
            category=Notification.Category.EQUIPMENT,
            entity_type="schedule",
            entity_uuid=schedule_b.uuid,
            title__startswith="Equipment conflict:",
        )
        recipients = set(notifications.values_list("recipient_id", flat=True))
        self.assertEqual(recipients, {self.user2.pk, self.user3.pk})


# ─── Periodic Task Tests ────────────────────────────────────────────────


class PeriodicTaskTest(TestCase):
    def setUp(self):
        from apps.equipment.models import EquipmentCategory

        self.user = User.objects.create_user(
            username="task_user", password="pass123",
            can_manage_schedules=True, can_manage_equipment=True,
        )
        self.category = EquipmentCategory.objects.create(
            name="Audio", slug="audio",
        )

    def test_check_upcoming_events(self):
        """check_upcoming_events notifies about confirmed schedules starting within 24h."""
        from apps.notifications.tasks import check_upcoming_events
        from apps.schedules.models import Schedule

        now = timezone.now()
        # Schedule starting in 12 hours — should trigger
        Schedule.objects.create(
            schedule_type="event",
            status=Schedule.Status.CONFIRMED,
            title="Upcoming Concert",
            start_datetime=now + timedelta(hours=12),
            end_datetime=now + timedelta(hours=36),
            created_by=self.user,
        )
        # Schedule starting in 48 hours — should NOT trigger
        Schedule.objects.create(
            schedule_type="event",
            status=Schedule.Status.CONFIRMED,
            title="Future Event",
            start_datetime=now + timedelta(hours=48),
            end_datetime=now + timedelta(hours=72),
            created_by=self.user,
        )

        count = check_upcoming_events()
        self.assertEqual(count, 1)
        self.assertTrue(
            Notification.objects.filter(
                title__contains="Upcoming Concert",
            ).exists()
        )

    def test_check_equipment_due_return(self):
        """check_equipment_due_return finds overdue schedules with active checkouts."""
        from apps.equipment.models import EquipmentModel
        from apps.notifications.tasks import check_equipment_due_return
        from apps.schedules.models import CheckoutRecord, Schedule, ScheduleEquipment

        now = timezone.now()
        model = EquipmentModel.objects.create(
            name="Test Speaker", is_numbered=False, total_quantity=10,
            category=self.category,
        )
        schedule = Schedule.objects.create(
            schedule_type="event",
            status=Schedule.Status.IN_PROGRESS,
            title="Overdue Event",
            start_datetime=now - timedelta(days=3),
            end_datetime=now - timedelta(days=1),
            created_by=self.user,
        )
        se = ScheduleEquipment.objects.create(
            schedule=schedule,
            equipment_model=model,
            quantity_planned=2,
        )
        CheckoutRecord.objects.create(
            schedule_equipment=se,
            quantity=2,
            checked_out_at=now - timedelta(days=3),
            checked_out_by=self.user,
        )

        count = check_equipment_due_return()
        self.assertEqual(count, 1)
        self.assertTrue(
            Notification.objects.filter(title__contains="Overdue").exists()
        )

    def test_check_rental_expiring(self):
        """check_rental_expiring categorizes severity correctly."""
        from apps.notifications.tasks import check_rental_expiring
        from apps.rentals.models import RentalAgreement

        today = timezone.now().date()

        # Expiring tomorrow — error severity
        RentalAgreement.objects.create(
            direction="in",
            status=RentalAgreement.Status.ACTIVE,
            vendor_name="Vendor A",
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=1),
            created_by=self.user,
        )
        # Expiring in 5 days — info severity
        RentalAgreement.objects.create(
            direction="in",
            status=RentalAgreement.Status.ACTIVE,
            vendor_name="Vendor B",
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=5),
            created_by=self.user,
        )

        count = check_rental_expiring()
        self.assertEqual(count, 2)

        notifs = Notification.objects.filter(title__startswith="Rental expiring")
        severities = set(notifs.values_list("severity", flat=True))
        self.assertIn("error", severities)
        self.assertIn("info", severities)

    def test_reconcile_equipment_status(self):
        """reconcile_equipment_status fixes mismatched item statuses."""
        from apps.equipment.models import EquipmentItem, EquipmentModel, EquipmentStatusLog
        from apps.notifications.tasks import reconcile_equipment_status

        model = EquipmentModel.objects.create(
            name="Test Mic", is_numbered=True,
            category=self.category,
        )
        item = EquipmentItem.objects.create(
            equipment_model=model,
            serial_number="MIC-001",
            current_status="available",
            is_active=True,
        )
        # Create a status log that says the item should be "out"
        EquipmentStatusLog.objects.create(
            equipment_item=item,
            action=EquipmentStatusLog.Action.CHECK_OUT,
            from_status="available",
            to_status="out",
            performed_by=self.user,
        )

        fix_count = reconcile_equipment_status()
        self.assertEqual(fix_count, 1)

        item.refresh_from_db()
        self.assertEqual(item.current_status, "out")

        # Verify a RECONCILE log was created
        self.assertTrue(
            EquipmentStatusLog.objects.filter(
                equipment_item=item,
                action=EquipmentStatusLog.Action.RECONCILE,
            ).exists()
        )
