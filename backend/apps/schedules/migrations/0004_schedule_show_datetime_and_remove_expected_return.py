from django.db import migrations, models
from django.db.models import F


def migrate_external_repair_expected_return_forward(apps, schema_editor):
    Schedule = apps.get_model("schedules", "Schedule")
    Schedule.objects.filter(
        schedule_type="external_repair",
        expected_return_date__isnull=False,
    ).update(end_datetime=F("expected_return_date"))


def migrate_external_repair_expected_return_reverse(apps, schema_editor):
    Schedule = apps.get_model("schedules", "Schedule")
    Schedule.objects.filter(
        schedule_type="external_repair",
    ).update(expected_return_date=F("end_datetime"))


class Migration(migrations.Migration):

    dependencies = [
        ("schedules", "0003_rename_contact_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="schedule",
            name="show_datetime",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            migrate_external_repair_expected_return_forward,
            migrate_external_repair_expected_return_reverse,
        ),
        migrations.RemoveField(
            model_name="schedule",
            name="expected_return_date",
        ),
    ]
