// ─── Dashboard Summary ───────────────────────────────────────────

export interface DashboardSummary {
  equipment: {
    total_models: number;
    total_items: number;
    items_available: number;
    items_out: number;
  };
  schedules: { active: number; draft: number };
  warehouse: { pending_confirmations: number };
  rentals: { active: number; draft: number };
  transfers: { planned: number };
  faults: { open: number };
}

// ─── Upcoming Schedule ───────────────────────────────────────────

export interface UpcomingSchedule {
  uuid: string;
  title: string;
  schedule_type: "event" | "external_repair" | "rental_out";
  status: "draft" | "confirmed" | "in_progress";
  start_datetime: string;
  end_datetime: string;
  location: string;
  has_conflicts: boolean;
  created_by: { uuid: string; full_name: string } | null;
  equipment_summary: {
    total_planned: number;
    total_checked_out: number;
    total_returned: number;
    checkout_progress: number;
  };
}

// ─── Attention Item ──────────────────────────────────────────────

export type AttentionSeverity = "critical" | "warning" | "info";
export type AttentionType =
  | "overdue_return"
  | "unresolved_fault"
  | "expiring_rental"
  | "pending_confirmation"
  | "unconfirmed_upcoming";

export interface AttentionItem {
  type: AttentionType;
  severity: AttentionSeverity;
  title: string;
  description: string;
  entity_type: string | null;
  entity_uuid: string | null;
  action_url: string;
  due_at: string | null;
  sort_weight: number;
}

// ─── Recent Activity ─────────────────────────────────────────────

export interface RecentActivityItem {
  uuid: string;
  user_display: string;
  action: string;
  category: string;
  description: string;
  entity_type: string;
  entity_uuid: string | null;
  entity_display: string;
  created_at: string;
}
