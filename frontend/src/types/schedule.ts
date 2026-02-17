// ─── Enums ──────────────────────────────────────────────────────────

export type ScheduleType = "event" | "external_repair" | "rental_out";
export type ScheduleStatus = "draft" | "confirmed" | "in_progress" | "completed" | "cancelled";

// ─── API Models ─────────────────────────────────────────────────────

export interface UserMinimal {
  uuid: string;
  full_name: string;
}

export interface ScheduleListItem {
  uuid: string;
  schedule_type: ScheduleType;
  status: ScheduleStatus;
  title: string;
  location: string;
  start_datetime: string;
  end_datetime: string;
  has_conflicts: boolean;
  created_by: UserMinimal | null;
  equipment_count: number;
  is_active: boolean;
  contact_name: string;
  notes: string;
}

export interface ScheduleDetail extends ScheduleListItem {
  id: number;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  expected_return_date: string | null;
  notes: string;
  parent: number | null;
  confirmed_at: string | null;
  confirmed_by: UserMinimal | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: UserMinimal | null;
  cancellation_reason: string;
  dispatch_events: ScheduleListItem[];
  equipment_allocations: ScheduleEquipmentItem[];
  created_at: string;
  updated_at: string;
}

export interface ScheduleFormData {
  schedule_type: ScheduleType;
  title: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  start_datetime: string;
  end_datetime: string;
  expected_return_date?: string;
  location?: string;
  notes?: string;
  parent?: string; // parent uuid
}

// ─── Equipment Allocation ───────────────────────────────────────────

export interface EquipmentModelNested {
  uuid: string;
  name: string;
  brand: string;
  category_name: string;
  is_numbered: boolean;
}

export interface PlannedItemNested {
  uuid: string;
  internal_id: string;
}

export interface ScheduleEquipmentItem {
  id: number;
  equipment_model: EquipmentModelNested;
  quantity_planned: number;
  is_over_allocated: boolean;
  over_allocation_note: string;
  notes: string;
  planned_items: PlannedItemNested[];
  quantity_checked_out: number;
  quantity_returned: number;
}

export interface ScheduleEquipmentFormData {
  equipment_model_uuid: string;
  quantity_planned: number;
  notes?: string;
  over_allocation_note?: string;
  planned_item_uuids?: string[];
}

// ─── Checkout Record ────────────────────────────────────────────────

export interface CheckoutRecordItem {
  id: number;
  equipment_item: { uuid: string; internal_id: string } | null;
  equipment_model_name: string;
  quantity: number;
  checked_out_at: string;
  checked_out_by: UserMinimal;
  checked_in_at: string | null;
  checked_in_by: UserMinimal | null;
  quantity_returned: number;
  condition_on_return: string;
  is_active: boolean;
  quantity_still_out: number;
}

// ─── Status Log ─────────────────────────────────────────────────────

export interface ScheduleStatusLogItem {
  from_status: string;
  to_status: string;
  changed_by: UserMinimal;
  changed_at: string;
  notes: string;
}

// ─── Availability ───────────────────────────────────────────────────

export interface ModelAvailability {
  total_owned: number;
  rental_received: number;
  total_dispatchable: number;
  allocated_by_others: number;
  confirmed_available: number;
  pending_rental_in: number;
  projected_available: number;
}

export interface AvailabilityCheckRequest {
  start_datetime: string;
  end_datetime: string;
  exclude_schedule?: string;
  equipment: Array<{
    equipment_model_uuid: string;
    quantity: number;
  }>;
}

export interface AvailabilityCheckResult {
  equipment_model: { uuid: string; name: string };
  requested: number;
  confirmed_available: number;
  projected_available: number;
  is_sufficient: boolean;
  shortage: number;
  conflicting_schedules?: Array<{
    uuid: string;
    title: string;
    planned: number;
    period: string;
  }>;
}

export interface AvailabilityCheckResponse {
  results: AvailabilityCheckResult[];
  has_any_conflict: boolean;
}

// ─── Paginated Response ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
