// ─── Enums ──────────────────────────────────────────────────────────

export type TransactionType = "check_out" | "check_in";
export type TransactionStatus = "pending_confirmation" | "confirmed" | "cancelled";

// ─── Nested Models ──────────────────────────────────────────────────

export interface MinimalUser {
  uuid: string;
  full_name: string;
}

export interface LineItemEquipmentModel {
  uuid: string;
  name: string;
  brand: string;
  category_name: string;
  is_numbered: boolean;
}

export interface LineItemEquipmentItem {
  uuid: string;
  serial_number: string;
  current_status: string;
}

export interface TransactionScheduleNested {
  uuid: string;
  title: string;
  schedule_type: string;
  status: string;
}

export interface TransactionRentalAgreementNested {
  uuid: string;
  vendor_name: string;
  agreement_number: string;
  direction: string;
}

// ─── Line Items ─────────────────────────────────────────────────────

export interface TransactionLineItem {
  id: number;
  equipment_model: LineItemEquipmentModel;
  equipment_item: LineItemEquipmentItem | null;
  quantity: number;
  condition_on_return: string;
  notes: string;
}

export interface TransactionLineItemCreate {
  equipment_model_uuid: string;
  equipment_item_uuid?: string;
  quantity?: number;
  condition_on_return?: string;
  notes?: string;
}

// ─── API Models ─────────────────────────────────────────────────────

export interface WarehouseTransactionList {
  uuid: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  schedule_title: string | null;
  rental_agreement_info: TransactionRentalAgreementNested | null;
  performed_by: MinimalUser;
  requires_confirmation: boolean;
  created_at: string;
}

export interface WarehouseTransactionDetail {
  id: number;
  uuid: string;
  transaction_type: TransactionType;
  status: TransactionStatus;
  requires_confirmation: boolean;
  schedule: TransactionScheduleNested | null;
  rental_agreement: TransactionRentalAgreementNested | null;
  performed_by: MinimalUser;
  confirmed_by: MinimalUser | null;
  confirmed_at: string | null;
  line_items: TransactionLineItem[];
  notes: string;
  created_at: string;
  updated_at: string;
}

// ─── Payloads ───────────────────────────────────────────────────────

export interface CheckOutPayload {
  schedule_uuid?: string;
  rental_agreement_uuid?: string;
  items: TransactionLineItemCreate[];
  requires_confirmation?: boolean;
  notes?: string;
}

export interface CheckInPayload {
  schedule_uuid?: string;
  rental_agreement_uuid?: string;
  items: TransactionLineItemCreate[];
  requires_confirmation?: boolean;
  notes?: string;
}

// ─── Paginated Response ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
