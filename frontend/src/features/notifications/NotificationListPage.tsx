import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Warehouse,
  CalendarRange,
  Package,
  FileText,
  ArrowLeftRight,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "@/hooks/use-notifications";
import type { Notification, NotificationCategory } from "@/types/notification";

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  warehouse: Warehouse,
  schedule: CalendarRange,
  equipment: Package,
  rental: FileText,
  transfer: ArrowLeftRight,
  system: Settings2,
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  warehouse: "Warehouse",
  schedule: "Schedule",
  equipment: "Equipment",
  rental: "Rental",
  transfer: "Transfer",
  system: "System",
};

function getEntityLink(n: Notification): string | null {
  if (!n.entity_uuid) return null;
  switch (n.entity_type) {
    case "warehouse_transaction":
      return `/warehouse/transactions/${n.entity_uuid}`;
    case "schedule":
      return `/schedules/${n.entity_uuid}`;
    case "equipment_item":
      return `/equipment/items/${n.entity_uuid}`;
    case "rental_agreement":
      return `/rentals/${n.entity_uuid}`;
    case "equipment_transfer":
      return `/transfers`;
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationListPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [readFilter, setReadFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page) };
  if (categoryFilter) params.category = categoryFilter;
  if (readFilter) params.is_read = readFilter;

  const notifications = useNotifications(params);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            All system notifications and alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
          <Link to="/settings/notifications">
            <Button variant="outline" size="icon" className="h-8 w-8" title="Notification preferences">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select
          value={categoryFilter || "all"}
          onValueChange={(v) => {
            setCategoryFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={readFilter || "all"}
          onValueChange={(v) => {
            setReadFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="false">Unread</SelectItem>
            <SelectItem value="true">Read</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {notifications.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border p-4 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          ))}
        </div>
      ) : notifications.data?.results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
          <Bell className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No notifications found
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.data?.results.map((n) => {
            const Icon = CATEGORY_ICON[n.category] ?? Bell;
            const link = getEntityLink(n);

            return (
              <div
                key={n.uuid}
                className={`rounded-md border p-4 transition-colors ${
                  !n.is_read
                    ? "border-primary/20 bg-primary/5"
                    : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      n.severity === "error"
                        ? "bg-destructive/10 text-destructive"
                        : n.severity === "warning"
                          ? "bg-warning/10 text-warning"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {n.title}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {CATEGORY_LABELS[n.category] ?? n.category}
                      </Badge>
                      {!n.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {n.message}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground/60">
                      <span>{formatDate(n.created_at)}</span>
                      {n.actor_name && <span>by {n.actor_name}</span>}
                      {link && (
                        <Link
                          to={link}
                          className="text-primary hover:underline"
                        >
                          View details
                        </Link>
                      )}
                    </div>
                  </div>
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => markAsRead.mutate(n.uuid)}
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <Pagination
            count={notifications.data?.count ?? 0}
            page={page}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

function Pagination({
  count,
  page,
  onPageChange,
  pageSize = 20,
}: {
  count: number;
  page: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
}) {
  const totalPages = Math.ceil(count / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">
        {count} total notifications
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="flex items-center px-3 text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
