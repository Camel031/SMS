// ─── Timeline Bar ────────────────────────────────────────────────

export interface TimelineBar {
  schedule_uuid: string;
  title: string;
  schedule_type: "event" | "external_repair" | "rental_out";
  status: "draft" | "confirmed" | "in_progress";
  start: string;
  end: string;
  quantity_planned: number;
  has_conflict: boolean;
  location: string;
}

// ─── Timeline Row (one per equipment model) ──────────────────────

export interface TimelineRow {
  equipment_model: {
    uuid: string;
    name: string;
    brand: string;
    category_name: string;
    is_numbered: boolean;
  };
  total_dispatchable: number;
  bars: TimelineBar[];
}

// ─── Timeline Response ──────────────────────────────────────────

export interface TimelineResponse {
  rows: TimelineRow[];
  range: { start: string; end: string };
}

// ─── Timeline Conflict ──────────────────────────────────────────

export interface TimelineConflict {
  schedule_uuid: string;
  schedule_title: string;
  equipment_model_uuid: string;
  equipment_model_name: string;
  quantity_planned: number;
  start: string;
  end: string;
}

// ─── Time Scale ─────────────────────────────────────────────────

export type TimeScale = "week" | "month" | "quarter";
