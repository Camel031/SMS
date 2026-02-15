// ─── Enums ──────────────────────────────────────────────────────────

export type TransferStatus = "planned" | "confirmed" | "cancelled";

// ─── Nested Models ──────────────────────────────────────────────────

export interface MinimalSchedule {
  uuid: string;
  title: string;
  schedule_type: string;
  status: string;
}

export interface MinimalUser {
  uuid: string;
  full_name: string;
}

export interface TransferLineItemEquipmentModel {
  uuid: string;
  name: string;
  brand: string;
}

export interface TransferLineItemEquipmentItem {
  uuid: string;
  serial_number: string;
  current_status: string;
}

// ─── Line Items ─────────────────────────────────────────────────────

export interface TransferLineItem {
  id: number;
  equipment_model: TransferLineItemEquipmentModel;
  equipment_item: TransferLineItemEquipmentItem | null;
  quantity: number;
  notes: string;
}

export interface TransferLineItemCreate {
  equipment_model_uuid: string;
  equipment_item_uuid?: string;
  quantity?: number;
  notes?: string;
}

// ─── API Models ─────────────────────────────────────────────────────

export interface EquipmentTransferList {
  uuid: string;
  from_schedule: MinimalSchedule;
  to_schedule: MinimalSchedule;
  status: TransferStatus;
  planned_datetime: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface EquipmentTransferDetail {
  id: number;
  uuid: string;
  from_schedule: MinimalSchedule;
  to_schedule: MinimalSchedule;
  status: TransferStatus;
  planned_datetime: string | null;
  executed_at: string | null;
  performed_by: MinimalUser | null;
  confirmed_by: MinimalUser | null;
  confirmed_at: string | null;
  created_by: MinimalUser | null;
  notes: string;
  line_items: TransferLineItem[];
  created_at: string;
  updated_at: string;
}

// ─── Payloads ───────────────────────────────────────────────────────

export interface TransferCreatePayload {
  from_schedule_uuid: string;
  to_schedule_uuid: string;
  items: TransferLineItemCreate[];
  planned_datetime?: string;
  notes?: string;
}

// ─── Paginated Response ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
