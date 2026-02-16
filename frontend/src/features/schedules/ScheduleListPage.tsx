import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  CalendarRange,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchedules } from "@/hooks/use-schedules";
import { usePermission } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { getQueryLoadState } from "@/lib/query-load-state";
import {
  getTabIntentProps,
  useTabIntentPrefetch,
} from "@/lib/tab-intent-prefetch";
import type {
  PaginatedResponse,
  ScheduleListItem,
  ScheduleType,
  ScheduleStatus,
} from "@/types/schedule";

// ─── Config ─────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ScheduleType,
  { label: string; variant: "default" | "warning" | "info" }
> = {
  event: { label: "Event", variant: "default" },
  external_repair: { label: "Repair", variant: "warning" },
  rental_out: { label: "Rental", variant: "info" },
};

const STATUS_CONFIG: Record<
  ScheduleStatus,
  {
    label: string;
    variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "success"
      | "warning"
      | "info";
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "info" },
  in_progress: { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;
type StatusTabValue = (typeof STATUS_TABS)[number]["value"];

// ─── Helpers ────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sStr = s.toLocaleDateString("en-US", opts);
  const eStr = e.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${sStr} \u2013 ${eStr}`;
}

// ─── Page Component ─────────────────────────────────────────────────

export default function ScheduleListPage() {
  const queryClient = useQueryClient();
  const [statusTab, setStatusTab] = useState<StatusTabValue>("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [page, setPage] = useState(1);

  const perms = usePermission();

  const buildParams = useCallback(
    (nextStatusTab: StatusTabValue) => {
      const next: Record<string, string> = { page: String(page) };
      if (nextStatusTab !== "all") next.status = nextStatusTab;
      if (typeFilter) next.schedule_type = typeFilter;
      if (search) next.search = search;
      if (conflictsOnly) next.has_conflicts = "true";
      return next;
    },
    [page, typeFilter, search, conflictsOnly],
  );

  const triggerPrefetch = useTabIntentPrefetch<StatusTabValue>((tab) => {
    const prefetchParams = buildParams(tab);
    return queryClient.prefetchQuery({
      queryKey: ["schedules", prefetchParams],
      queryFn: async () => {
        const { data } = await api.get<PaginatedResponse<ScheduleListItem>>(
          "/schedules/",
          { params: prefetchParams },
        );
        return data;
      },
    });
  });

  // Build query params
  const params = buildParams(statusTab);

  const schedules = useSchedules(params);
  const { isInitialLoading, isRefreshing } = getQueryLoadState(schedules);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Manage events, repairs, and rental schedules
          </p>
        </div>
        {perms.canManageSchedules && (
          <Button size="sm" asChild>
            <Link to="/schedules/new">
              <Plus className="h-4 w-4" />
              New Schedule
            </Link>
          </Button>
        )}
      </div>

      {/* Status Tabs */}
      <Tabs
        value={statusTab}
        onValueChange={(v) => {
          setStatusTab(v as StatusTabValue);
          setPage(1);
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                {...getTabIntentProps(tab.value, triggerPrefetch)}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Search + Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-48 pl-8 h-8 text-sm"
              />
            </div>
            <Select
              value={typeFilter || "all"}
              onValueChange={(v) => {
                setTypeFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={conflictsOnly}
                onChange={(e) => {
                  setConflictsOnly(e.target.checked);
                  setPage(1);
                }}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <AlertTriangle className="h-3 w-3" />
              Conflicts
            </label>
          </div>
        </div>

        {/* Table content — rendered for every tab via a single TabsContent per status */}
        {STATUS_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <QueryRefreshIndicator show={isRefreshing} />
            {isInitialLoading ? (
              <TableSkeleton rows={5} cols={8} />
            ) : schedules.data?.results.length === 0 ? (
              <EmptyState message="No schedules found" />
            ) : (
              <>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead className="text-right">Equipment</TableHead>
                        <TableHead className="text-center">Conflicts</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules.data?.results.map((schedule) => {
                        const typeCfg = TYPE_CONFIG[schedule.schedule_type];
                        const statusCfg = STATUS_CONFIG[schedule.status];
                        return (
                          <TableRow key={schedule.uuid}>
                            <TableCell>
                              <Link
                                to={`/schedules/${schedule.uuid}`}
                                className="font-medium text-foreground hover:text-primary transition-colors"
                              >
                                {schedule.title}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant={typeCfg?.variant ?? "default"}>
                                {typeCfg?.label ?? schedule.schedule_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusCfg?.variant ?? "outline"}>
                                {statusCfg?.label ?? schedule.status}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="max-w-[180px] truncate text-muted-foreground"
                              title={schedule.location}
                            >
                              {schedule.location || "\u2014"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDateRange(
                                schedule.start_datetime,
                                schedule.end_datetime,
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {schedule.equipment_count}
                            </TableCell>
                            <TableCell className="text-center">
                              {schedule.has_conflicts && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="w-8">
                              <Link to={`/schedules/${schedule.uuid}`}>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <Pagination
                  count={schedules.data?.count ?? 0}
                  page={page}
                  onPageChange={setPage}
                />
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

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
        {count} total results
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
      <CalendarRange className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
