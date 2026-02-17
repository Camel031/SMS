export interface EquipmentTemplateItem {
  id: number;
  equipment_model: number;
  model_name: string;
  model_uuid: string;
  model_brand: string;
  category_name: string;
  quantity: number;
}

export interface EquipmentTemplate {
  uuid: string;
  name: string;
  description: string;
  item_count: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentTemplateDetail extends EquipmentTemplate {
  items: EquipmentTemplateItem[];
}

export interface EquipmentTemplateFormData {
  name: string;
  description?: string;
  items: Array<{ equipment_model: number; quantity: number }>;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface BatchImportPreview {
  valid_count: number;
  error_count: number;
  valid_rows: Array<{
    equipment_model_uuid: string;
    equipment_model_name: string;
    internal_id: string;
    notes: string;
  }>;
  errors: Array<{
    row: number;
    errors: string[];
    data: Record<string, string>;
  }>;
}

export interface BatchImportResult {
  created: number;
  items: Array<{
    uuid: string;
    internal_id: string;
    model_name: string;
  }>;
}
