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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useNotifications,
  useUnreadCount,
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unreadCount = useUnreadCount();
  const notifications = useNotifications({ page: "1" });
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const count = unreadCount.data ?? 0;
  const items = notifications.data?.results ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="mt-2 text-xs">No notifications</p>
            </div>
          ) : (
            items.slice(0, 10).map((n) => {
              const Icon = CATEGORY_ICON[n.category] ?? Bell;
              const link = getEntityLink(n);

              const content = (
                <div
                  className={`flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/5 ${
                    !n.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      n.severity === "error"
                        ? "bg-destructive/10 text-destructive"
                        : n.severity === "warning"
                          ? "bg-warning/10 text-warning"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight text-foreground">
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-2">
                      {n.message}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {timeAgo(n.created_at)}
                      {n.actor_name ? ` \u00b7 ${n.actor_name}` : ""}
                    </p>
                  </div>
                  {!n.is_read && (
                    <button
                      className="mt-1 shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markAsRead.mutate(n.uuid);
                      }}
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );

              if (link) {
                return (
                  <Link
                    key={n.uuid}
                    to={link}
                    onClick={() => {
                      setOpen(false);
                      if (!n.is_read) markAsRead.mutate(n.uuid);
                    }}
                  >
                    {content}
                  </Link>
                );
              }
              return <div key={n.uuid}>{content}</div>;
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <>
            <Separator />
            <div className="p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                asChild
              >
                <Link to="/notifications" onClick={() => setOpen(false)}>
                  View all notifications
                </Link>
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
