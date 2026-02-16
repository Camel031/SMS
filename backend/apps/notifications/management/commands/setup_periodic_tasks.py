import json

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update Celery Beat periodic tasks for notifications"

    def handle(self, *args, **options):
        from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask

        # 1. check_upcoming_events — every 1 hour
        interval_1h, _ = IntervalSchedule.objects.get_or_create(
            every=1, period=IntervalSchedule.HOURS,
        )
        PeriodicTask.objects.update_or_create(
            name="check_upcoming_events",
            defaults={
                "task": "apps.notifications.tasks.check_upcoming_events",
                "interval": interval_1h,
                "crontab": None,
                "enabled": True,
            },
        )
        self.stdout.write(self.style.SUCCESS("  ✓ check_upcoming_events (every 1 hour)"))

        # 2. check_equipment_due_return — daily at 08:00 Asia/Taipei
        cron_0800, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="8", day_of_week="*",
            day_of_month="*", month_of_year="*",
            timezone="Asia/Taipei",
        )
        PeriodicTask.objects.update_or_create(
            name="check_equipment_due_return",
            defaults={
                "task": "apps.notifications.tasks.check_equipment_due_return",
                "crontab": cron_0800,
                "interval": None,
                "enabled": True,
            },
        )
        self.stdout.write(self.style.SUCCESS("  ✓ check_equipment_due_return (daily 08:00)"))

        # 3. check_rental_expiring — daily at 08:00 Asia/Taipei (same crontab)
        PeriodicTask.objects.update_or_create(
            name="check_rental_expiring",
            defaults={
                "task": "apps.notifications.tasks.check_rental_expiring",
                "crontab": cron_0800,
                "interval": None,
                "enabled": True,
            },
        )
        self.stdout.write(self.style.SUCCESS("  ✓ check_rental_expiring (daily 08:00)"))

        # 4. reconcile_equipment_status — daily at 04:00 Asia/Taipei
        cron_0400, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="4", day_of_week="*",
            day_of_month="*", month_of_year="*",
            timezone="Asia/Taipei",
        )
        PeriodicTask.objects.update_or_create(
            name="reconcile_equipment_status",
            defaults={
                "task": "apps.notifications.tasks.reconcile_equipment_status",
                "crontab": cron_0400,
                "interval": None,
                "enabled": True,
            },
        )
        self.stdout.write(self.style.SUCCESS("  ✓ reconcile_equipment_status (daily 04:00)"))

        self.stdout.write(self.style.SUCCESS("\nAll 4 periodic tasks registered."))
