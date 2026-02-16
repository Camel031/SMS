import { Link } from "react-router-dom";
import {
  Package,
  CalendarRange,
  Warehouse,
  FileText,
  ArrowLeftRight,
  Users,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentActivity } from "@/hooks/use-dashboard";

const CATEGORY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  equipment: Package,
  schedule: CalendarRange,
  warehouse: Warehouse,
  rental: FileText,
  transfer: ArrowLeftRight,
  user: Users,
};

const CATEGORY_LINKS: Record<string, (uuid: string) => string> = {
  equipment: (uuid) => `/equipment/models/${uuid}`,
  schedule: (uuid) => `/schedules/${uuid}`,
  warehouse: (uuid) => `/warehouse/transactions/${uuid}`,
  rental: (uuid) => `/rentals/${uuid}`,
  transfer: (uuid) => `/transfers/${uuid}`,
};

export default function RecentActivityFeed() {
  const { data: activities, isLoading } = useRecentActivity();

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Recent Activity</h3>
        </div>
        <Link
          to="/admin/audit-logs"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <Skeleton className="mt-0.5 h-7 w-7 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))
        ) : !activities?.length ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No recent activity
          </div>
        ) : (
          activities.map((entry) => {
            const Icon = CATEGORY_ICONS[entry.category] ?? Package;
            const linkFn = CATEGORY_LINKS[entry.category];
            const href =
              linkFn && entry.entity_uuid
                ? linkFn(entry.entity_uuid)
                : undefined;

            const content = (
              <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{entry.user_display}</span>{" "}
                    <span className="text-muted-foreground">
                      {entry.description}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );

            if (href) {
              return (
                <Link key={entry.uuid} to={href}>
                  {content}
                </Link>
              );
            }
            return <div key={entry.uuid}>{content}</div>;
          })
        )}
      </div>
    </div>
  );
}
