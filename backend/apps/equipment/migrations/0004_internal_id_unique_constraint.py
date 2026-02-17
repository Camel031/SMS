from django.db import migrations, models


def backfill_internal_id_from_serial(apps, schema_editor):
    EquipmentItem = apps.get_model("equipment", "EquipmentItem")
    EquipmentItem.objects.filter(internal_id="").update(internal_id=models.F("serial_number"))


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0003_equipmentitem_model_serial_unique"),
    ]

    operations = [
        migrations.RunPython(backfill_internal_id_from_serial, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="equipmentitem",
            name="uniq_equipment_model_serial_number",
        ),
        migrations.AddConstraint(
            model_name="equipmentitem",
            constraint=models.UniqueConstraint(
                condition=models.Q(internal_id__gt=""),
                fields=("equipment_model", "internal_id"),
                name="uniq_equipment_model_internal_id",
            ),
        ),
    ]
