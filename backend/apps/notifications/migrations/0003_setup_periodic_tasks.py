"""Data migration: register 4 Celery Beat periodic tasks."""

from django.db import migrations


def setup_periodic_tasks(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    # Interval: every 1 hour
    interval_1h, _ = IntervalSchedule.objects.get_or_create(
        every=1, period="hours",
    )

    # Crontab: daily 08:00 Asia/Taipei
    cron_0800, _ = CrontabSchedule.objects.get_or_create(
        minute="0", hour="8", day_of_week="*",
        day_of_month="*", month_of_year="*",
        timezone="Asia/Taipei",
    )

    # Crontab: daily 04:00 Asia/Taipei
    cron_0400, _ = CrontabSchedule.objects.get_or_create(
        minute="0", hour="4", day_of_week="*",
        day_of_month="*", month_of_year="*",
        timezone="Asia/Taipei",
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
    PeriodicTask.objects.update_or_create(
        name="check_equipment_due_return",
        defaults={
            "task": "apps.notifications.tasks.check_equipment_due_return",
            "crontab": cron_0800,
            "interval": None,
            "enabled": True,
        },
    )
    PeriodicTask.objects.update_or_create(
        name="check_rental_expiring",
        defaults={
            "task": "apps.notifications.tasks.check_rental_expiring",
            "crontab": cron_0800,
            "interval": None,
            "enabled": True,
        },
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


def remove_periodic_tasks(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name__in=[
        "check_upcoming_events",
        "check_equipment_due_return",
        "check_rental_expiring",
        "reconcile_equipment_status",
    ]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0002_usernotificationpreference"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [
        migrations.RunPython(setup_periodic_tasks, remove_periodic_tasks),
    ]
