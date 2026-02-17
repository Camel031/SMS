import csv
import io

from django.db import transaction

from .models import EquipmentItem, EquipmentModel, EquipmentStatusLog


class BatchImportService:
    """Parse and validate CSV files for batch equipment import."""

    REQUIRED_COLUMNS = {"equipment_model_uuid", "serial_number"}
    OPTIONAL_COLUMNS = {"internal_id", "ownership_type", "notes"}
    ALL_COLUMNS = REQUIRED_COLUMNS | OPTIONAL_COLUMNS

    @classmethod
    def parse_and_validate(cls, csv_file):
        """Parse CSV and validate rows. Returns {valid_rows, errors}."""
        try:
            content = csv_file.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return {"valid_rows": [], "errors": [{"row": 0, "error": "File is not valid UTF-8."}]}

        reader = csv.DictReader(io.StringIO(content))

        if not reader.fieldnames:
            return {"valid_rows": [], "errors": [{"row": 0, "error": "Empty CSV file."}]}

        # Check required columns
        headers = set(reader.fieldnames)
        missing = cls.REQUIRED_COLUMNS - headers
        if missing:
            return {
                "valid_rows": [],
                "errors": [{"row": 0, "error": f"Missing required columns: {', '.join(sorted(missing))}"}],
            }

        # Pre-fetch all equipment models for validation
        model_cache = {}
        for m in EquipmentModel.objects.filter(is_active=True):
            model_cache[str(m.uuid)] = m

        # Pre-fetch existing serial numbers
        existing_serials = set(
            EquipmentItem.objects.values_list("serial_number", flat=True)
        )

        valid_rows = []
        errors = []
        seen_serials = set()

        for row_num, row in enumerate(reader, start=2):  # Row 1 is header
            row_errors = []

            # Validate equipment_model_uuid
            model_uuid = (row.get("equipment_model_uuid") or "").strip()
            if not model_uuid:
                row_errors.append("equipment_model_uuid is required.")
            elif model_uuid not in model_cache:
                row_errors.append(f"Equipment model '{model_uuid}' not found.")
            else:
                eq_model = model_cache[model_uuid]
                if not eq_model.is_numbered:
                    row_errors.append(
                        f"Equipment model '{eq_model.name}' is unnumbered. "
                        "Batch import only supports numbered equipment."
                    )

            # Validate serial_number
            serial = (row.get("serial_number") or "").strip()
            if not serial:
                row_errors.append("serial_number is required.")
            elif serial in existing_serials:
                row_errors.append(f"Serial number '{serial}' already exists in database.")
            elif serial in seen_serials:
                row_errors.append(f"Duplicate serial number '{serial}' in CSV.")

            # Validate ownership_type
            ownership = (row.get("ownership_type") or "owned").strip().lower()
            if ownership not in ("owned", "rented_in"):
                row_errors.append(f"Invalid ownership_type: '{ownership}'. Must be 'owned' or 'rented_in'.")

            if ownership == "rented_in":
                row_errors.append(
                    "Rented-in equipment requires a rental agreement. "
                    "Use the rental workflow instead of batch import."
                )

            if row_errors:
                errors.append({"row": row_num, "errors": row_errors, "data": dict(row)})
            else:
                seen_serials.add(serial)
                valid_rows.append({
                    "equipment_model_uuid": model_uuid,
                    "equipment_model_id": model_cache[model_uuid].id,
                    "equipment_model_name": str(model_cache[model_uuid]),
                    "serial_number": serial,
                    "internal_id": (row.get("internal_id") or "").strip(),
                    "notes": (row.get("notes") or "").strip(),
                })

        return {"valid_rows": valid_rows, "errors": errors}

    @classmethod
    @transaction.atomic
    def execute_import(cls, valid_rows, user):
        """Create EquipmentItems and REGISTER status logs."""
        created_items = []

        for row in valid_rows:
            item = EquipmentItem.objects.create(
                equipment_model_id=row["equipment_model_id"],
                serial_number=row["serial_number"],
                internal_id=row.get("internal_id", ""),
                notes=row.get("notes", ""),
                current_status=EquipmentItem.Status.AVAILABLE,
            )
            EquipmentStatusLog.objects.create(
                equipment_item=item,
                action=EquipmentStatusLog.Action.REGISTER,
                from_status="",
                to_status=EquipmentItem.Status.AVAILABLE,
                performed_by=user,
                notes="Batch import",
            )
            created_items.append(item)

        return {
            "created": len(created_items),
            "items": [
                {
                    "uuid": str(item.uuid),
                    "serial_number": item.serial_number,
                    "model_name": str(item.equipment_model),
                }
                for item in created_items
            ],
        }
