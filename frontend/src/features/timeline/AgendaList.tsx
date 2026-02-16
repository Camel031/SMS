import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, isSameDay } from "date-fns";
import { ArrowRight } from "lucide-react";
import type { TimelineRow, TimelineBar } from "@/types/timeline";

interface AgendaEntry extends TimelineBar {
  equipment_model_name: string;
}

interface AgendaListProps {
  rows: TimelineRow[];
}

export default function AgendaList({ rows }: AgendaListProps) {
  // Flatten all bars with model info, group by start date
  const grouped = useMemo(() => {
    const entries: AgendaEntry[] = [];
    for (const row of rows) {
      for (const bar of row.bars) {
        entries.push({
          ...bar,
          equipment_model_name: row.equipment_model.name,
        });
      }
    }

    // Sort by start date
    entries.sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );

    // Group by date
    const groups: { date: Date; entries: AgendaEntry[] }[] = [];
    for (const entry of entries) {
      const entryDate = new Date(entry.start);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && isSameDay(lastGroup.date, entryDate)) {
        lastGroup.entries.push(entry);
      } else {
        groups.push({ date: entryDate, entries: [entry] });
      }
    }

    return groups;
  }, [rows]);

  if (grouped.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        No equipment allocated in this period
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.date.toISOString()}>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {format(group.date, "EEEE, MMM d")}
            </h3>
          </div>
          <div className="space-y-2">
            {group.entries.map((entry, i) => (
              <Link
                key={`${entry.schedule_uuid}-${i}`}
                to={`/schedules/${entry.schedule_uuid}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    TYPE_DOT_COLORS[entry.schedule_type] ??
                    "bg-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{entry.equipment_model_name}</span>
                    <span>&middot;</span>
                    <span>×{entry.quantity_planned}</span>
                    <span>&middot;</span>
                    <span>{entry.status}</span>
                    {entry.has_conflict && (
                      <span className="rounded bg-destructive/10 px-1 text-[10px] font-medium text-destructive">
                        Conflict
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const TYPE_DOT_COLORS: Record<string, string> = {
  event: "bg-blue-500",
  external_repair: "bg-amber-500",
  rental_out: "bg-purple-500",
};
