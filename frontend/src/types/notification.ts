export type NotificationCategory =
  | "warehouse"
  | "schedule"
  | "equipment"
  | "rental"
  | "transfer"
  | "system";

export type NotificationSeverity = "info" | "warning" | "error";

export interface Notification {
  uuid: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  entity_type: string;
  entity_uuid: string | null;
  actor_name: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
