from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0002_equipmenttemplate_equipmenttemplateitem"),
    ]

    operations = [
        migrations.AlterField(
            model_name="equipmentitem",
            name="serial_number",
            field=models.CharField(max_length=255),
        ),
        migrations.AddConstraint(
            model_name="equipmentitem",
            constraint=models.UniqueConstraint(
                fields=("equipment_model", "serial_number"),
                name="uniq_equipment_model_serial_number",
            ),
        ),
    ]

