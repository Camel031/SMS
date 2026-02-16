import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useNotificationPreferences,
  useTogglePreference,
  useBulkToggle,
  useResetPreferences,
} from "@/hooks/use-notification-preferences";
import type { EventTypeConfig } from "@/types/notification-preferences";

const CATEGORY_ORDER = [
  "schedule",
  "warehouse",
  "equipment",
  "rental",
  "transfer",
  "system",
];

const CATEGORY_LABELS: Record<string, string> = {
  schedule: "Schedule",
  warehouse: "Warehouse",
  equipment: "Equipment",
  rental: "Rental",
  transfer: "Transfer",
  system: "System",
};

export default function NotificationPreferencesPage() {
  const { data, isLoading } = useNotificationPreferences();
  const toggle = useTogglePreference();
  const bulkToggle = useBulkToggle();
  const reset = useResetPreferences();

  // Group event types by category
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, EventTypeConfig[]>();
    for (const evt of data.event_types) {
      const list = map.get(evt.category) || [];
      list.push(evt);
      map.set(evt.category, list);
    }
    return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      events: map.get(cat)!,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const channels = data.channels;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/notifications"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Notification Preferences
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose which notifications you receive and how
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            reset.mutate(undefined, {
              onSuccess: () => toast.success("Preferences reset to defaults"),
            });
          }}
          disabled={reset.isPending}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>

      {/* Desktop: Matrix table */}
      <div className="hidden md:block">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="flex items-center border-b border-border bg-secondary/30 px-4 py-3">
            <div className="flex-1 text-xs font-medium text-muted-foreground">
              Event Type
            </div>
            {channels.map((ch) => (
              <div
                key={ch.key}
                className="flex w-24 flex-col items-center gap-1"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {ch.display_name}
                </span>
                <button
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => {
                    // Check if all are enabled; if so, disable all; otherwise enable all
                    const allEnabled = data.event_types.every(
                      (evt) => data.preferences[evt.key]?.[ch.key],
                    );
                    bulkToggle.mutate({ channel: ch.key, is_enabled: !allEnabled });
                  }}
                >
                  Toggle all
                </button>
              </div>
            ))}
          </div>

          {/* Table body */}
          {grouped.map((group) => (
            <div key={group.category}>
              {/* Category header */}
              <div className="border-b border-border bg-secondary/10 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
              </div>

              {/* Event rows */}
              {group.events.map((evt) => (
                <div
                  key={evt.key}
                  className="flex items-center border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {evt.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {evt.description}
                    </p>
                  </div>
                  {channels.map((ch) => (
                    <div
                      key={ch.key}
                      className="flex w-24 items-center justify-center"
                    >
                      <Switch
                        checked={data.preferences[evt.key]?.[ch.key] ?? false}
                        onCheckedChange={(checked) => {
                          toggle.mutate({
                            event_type: evt.key,
                            channel: ch.key,
                            is_enabled: checked,
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: Stacked cards */}
      <div className="block md:hidden space-y-4">
        {grouped.map((group) => (
          <div
            key={group.category}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <div className="border-b border-border bg-secondary/10 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            </div>
            <div className="divide-y divide-border">
              {group.events.map((evt) => (
                <div key={evt.key} className="px-4 py-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {evt.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {evt.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {channels.map((ch) => (
                      <label
                        key={ch.key}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Switch
                          checked={
                            data.preferences[evt.key]?.[ch.key] ?? false
                          }
                          onCheckedChange={(checked) => {
                            toggle.mutate({
                              event_type: evt.key,
                              channel: ch.key,
                              is_enabled: checked,
                            });
                          }}
                        />
                        {ch.display_name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
