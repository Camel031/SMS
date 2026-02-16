import { Link } from "react-router-dom";
import { CalendarRange, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useUpcomingSchedules } from "@/hooks/use-dashboard";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted-foreground",
  confirmed: "bg-blue-500",
  in_progress: "bg-green-500",
};

const TYPE_LABELS: Record<string, string> = {
  event: "Event",
  external_repair: "Repair",
  rental_out: "Rental",
};

export default function UpcomingSchedulesCard() {
  const { data: schedules, isLoading } = useUpcomingSchedules();

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Upcoming Schedules</h3>
        </div>
        <Link
          to="/schedules?status=confirmed,in_progress"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-2 w-2 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))
        ) : !schedules?.length ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No upcoming schedules in the next 7 days
          </div>
        ) : (
          schedules.map((s) => (
            <Link
              key={s.uuid}
              to={`/schedules/${s.uuid}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/5"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[s.status] ?? "bg-muted-foreground"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {s.title}
                  </span>
                  {s.has_conflicts && (
                    <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      Conflict
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{TYPE_LABELS[s.schedule_type] ?? s.schedule_type}</span>
                  <span>&middot;</span>
                  <span>
                    Starts{" "}
                    {formatDistanceToNow(new Date(s.start_datetime), {
                      addSuffix: true,
                    })}
                  </span>
                  {s.equipment_summary.total_planned > 0 && (
                    <>
                      <span>&middot;</span>
                      <span>
                        {s.equipment_summary.checkout_progress}% out
                      </span>
                    </>
                  )}
                </div>
                {s.equipment_summary.total_planned > 0 && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${s.equipment_summary.checkout_progress}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
