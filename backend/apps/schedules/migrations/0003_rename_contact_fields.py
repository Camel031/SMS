from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            "schedules",
            "0002_checkoutrecord_scheduleequipment_schedulestatuslog_and_more",
        ),
    ]

    operations = [
        migrations.RenameField(
            model_name="schedule",
            old_name="contact_name",
            new_name="customer_name",
        ),
        migrations.RemoveField(
            model_name="schedule",
            name="contact_email",
        ),
        migrations.AlterField(
            model_name="schedule",
            name="customer_name",
            field=models.CharField(max_length=255),
        ),
    ]
