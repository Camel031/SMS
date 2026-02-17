// ─── Enums ──────────────────────────────────────────────────────────

export type RentalDirection = "in" | "out";
export type RentalStatus = "draft" | "active" | "returning" | "completed" | "cancelled";

// ─── Line Items ─────────────────────────────────────────────────────

export interface RentalAgreementLine {
  id: number;
  equipment_model_uuid: string;
  equipment_model_name: string;
  equipment_model_brand: string;
  category_name: string;
  quantity: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface RentalAgreementLineCreate {
  equipment_model_uuid: string;
  quantity: number;
  notes?: string;
}

// ─── Nested Models ──────────────────────────────────────────────────

export interface MinimalUser {
  uuid: string;
  full_name: string;
}

export interface EquipmentSummary {
  total_items: number;
  by_status: Record<string, number>;
}

export interface EquipmentItemMinimal {
  uuid: string;
  internal_id: string;
  current_status: string;
  equipment_model_name: string;
}

// ─── API Models ─────────────────────────────────────────────────────

export interface RentalAgreementList {
  uuid: string;
  direction: RentalDirection;
  status: RentalStatus;
  agreement_number: string;
  vendor_name: string;
  start_date: string;
  end_date: string;
  line_count: number;
  equipment_count: number;
}

export interface RentalAgreementDetail {
  id: number;
  uuid: string;
  direction: RentalDirection;
  status: RentalStatus;
  agreement_number: string;
  vendor_name: string;
  vendor_contact: string;
  vendor_phone: string;
  vendor_email: string;
  start_date: string;
  end_date: string;
  notes: string;
  created_by: MinimalUser | null;
  created_by_name: string | null;
  is_active: boolean;
  lines: RentalAgreementLine[];
  equipment_summary: EquipmentSummary;
  created_at: string;
  updated_at: string;
}

// ─── Payloads ───────────────────────────────────────────────────────

export interface RentalAgreementCreateUpdate {
  direction?: RentalDirection;
  vendor_name: string;
  vendor_contact?: string;
  vendor_phone?: string;
  vendor_email?: string;
  start_date: string;
  end_date: string;
  notes?: string;
}

// ─── Paginated Response ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
