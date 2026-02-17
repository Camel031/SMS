// --- Equipment Category ---

export interface EquipmentCategory {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  parent: number | null;
  sort_order: number;
  is_active: boolean;
  full_path: string;
  children_count: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentCategoryTree {
  id: number;
  uuid: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  children: EquipmentCategoryTree[];
}

export interface CategoryFormData {
  name: string;
  slug: string;
  parent?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

// --- Equipment Model ---

export interface EquipmentModel {
  id: number;
  uuid: string;
  name: string;
  brand: string;
  model_number: string;
  category: number;
  category_name: string;
  is_numbered: boolean;
  total_quantity: number;
  is_active: boolean;
  item_count: number;
  available_count: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentModelDetail extends EquipmentModel {
  description: string;
  category_path: string;
  image: string | null;
  custom_fields: Record<string, unknown>;
}

export interface EquipmentModelFormData {
  name: string;
  brand?: string;
  model_number?: string;
  description?: string;
  category: number;
  is_numbered?: boolean;
  total_quantity?: number;
  image?: File | null;
  custom_fields?: Record<string, unknown>;
  is_active?: boolean;
}

// --- Equipment Item ---

export type EquipmentStatus =
  | "pending_receipt"
  | "available"
  | "out"
  | "reserved"
  | "lost"
  | "retired"
  | "returned_to_vendor";

export type OwnershipType = "owned" | "rented_in";

export interface EquipmentItem {
  id: number;
  uuid: string;
  internal_id: string;
  equipment_model: number;
  model_name: string;
  model_brand: string;
  category_name: string;
  current_status: EquipmentStatus;
  ownership_type: OwnershipType;
  is_active: boolean;
  active_fault_count: number;
  created_at: string;
  updated_at: string;
}

export interface EquipmentItemDetail extends EquipmentItem {
  rental_agreement: number | null;
  lamp_hours: number;
  purchase_date: string | null;
  warranty_expiry: string | null;
  notes: string;
  custom_fields: Record<string, unknown>;
}

export interface EquipmentItemFormData {
  equipment_model: number;
  internal_id?: string;
  ownership_type?: OwnershipType;
  rental_agreement?: number | null;
  lamp_hours?: number;
  purchase_date?: string | null;
  warranty_expiry?: string | null;
  notes?: string;
  custom_fields?: Record<string, unknown>;
  is_active?: boolean;
}

export interface EquipmentItemBatchCreatePayload {
  equipment_model: number;
  internal_id: string;
  quantity?: number;
  ownership_type?: OwnershipType;
  rental_agreement?: number | null;
  lamp_hours?: number;
  purchase_date?: string | null;
  warranty_expiry?: string | null;
  notes?: string;
  custom_fields?: Record<string, unknown>;
  is_active?: boolean;
}

export interface EquipmentItemBatchCreateResponse {
  count: number;
  items: EquipmentItem[];
}

// --- Status Log ---

export interface EquipmentStatusLog {
  id: number;
  action: string;
  from_status: string;
  to_status: string;
  schedule: number | null;
  rental_agreement: number | null;
  warehouse_transaction: number | null;
  equipment_transfer: number | null;
  performed_by: number;
  performed_by_name: string;
  performed_at: string;
  notes: string;
}

// --- Fault Record ---

export type FaultSeverity = "low" | "medium" | "high" | "critical";

export interface FaultRecord {
  id: number;
  uuid: string;
  equipment_item: number;
  equipment_item_display: string;
  reported_by: number | null;
  reported_by_name: string | null;
  title: string;
  description: string;
  severity: FaultSeverity;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  resolved_by_name: string | null;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
}

export interface FaultFormData {
  title: string;
  description: string;
  severity: FaultSeverity;
}

// --- Custom Field ---

export type FieldType = "text" | "number" | "boolean" | "date" | "select" | "multiselect";
export type EntityType = "equipment_model" | "equipment_item";

export interface CustomFieldDefinition {
  id: number;
  name: string;
  slug: string;
  field_type: FieldType;
  entity_type: EntityType;
  category: number | null;
  category_name: string | null;
  is_required: boolean;
  default_value: unknown;
  description: string;
  placeholder: string;
  options: Array<{ value: string; label: string }> | null;
  validation_rules: Record<string, unknown> | null;
  display_order: number;
  is_filterable: boolean;
  is_visible_in_list: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldFormData {
  name: string;
  slug: string;
  field_type: FieldType;
  entity_type: EntityType;
  category?: number | null;
  is_required?: boolean;
  default_value?: unknown;
  description?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }> | null;
  validation_rules?: Record<string, unknown> | null;
  display_order?: number;
  is_filterable?: boolean;
  is_visible_in_list?: boolean;
  is_active?: boolean;
}

// --- Inventory ---

export interface InventorySummary {
  total_models: number;
  total_items: number;
  total_unresolved_faults: number;
  by_status: Record<EquipmentStatus, number>;
}

export interface InventoryByStatusItem {
  uuid: string;
  name: string;
  category: string;
  is_numbered: boolean;
  total_quantity: number;
  count: number;
}

// --- Paginated response ---

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
