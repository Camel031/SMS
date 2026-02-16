export interface EventTypeConfig {
  key: string;
  display_name: string;
  category: string;
  description: string;
}

export interface ChannelConfig {
  key: string;
  display_name: string;
}

export interface PreferenceMatrix {
  event_types: EventTypeConfig[];
  channels: ChannelConfig[];
  preferences: Record<string, Record<string, boolean>>;
}

export interface PreferenceTogglePayload {
  event_type: string;
  channel: string;
  is_enabled: boolean;
}

export interface BulkTogglePayload {
  channel: string;
  is_enabled: boolean;
}

export interface ResetResponse extends PreferenceMatrix {
  deleted: number;
}
