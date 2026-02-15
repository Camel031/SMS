export type AuditCategory =
  | "equipment"
  | "schedule"
  | "warehouse"
  | "rental"
  | "transfer"
  | "user";

export interface AuditLog {
  uuid: string;
  user_display: string;
  action: string;
  category: AuditCategory;
  description: string;
  entity_type: string;
  entity_uuid: string | null;
  entity_display: string;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
