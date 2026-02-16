import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  FileText,
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
import { useRentalAgreements } from "@/hooks/use-rentals";
import { api } from "@/lib/api";
import { getQueryLoadState } from "@/lib/query-load-state";
import type {
  PaginatedResponse,
  RentalAgreementList,
  RentalDirection,
  RentalStatus,
} from "@/types/rental";

// ─── Config ─────────────────────────────────────────────────────────

const DIRECTION_CONFIG: Record<
  RentalDirection,
  { label: string; variant: "info" | "warning" }
> = {
  in: { label: "Rental In", variant: "info" },
  out: { label: "Rental Out", variant: "warning" },
};

const STATUS_CONFIG: Record<
  RentalStatus,
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
  active: { label: "Active", variant: "info" },
  returning: { label: "Returning", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const DIRECTION_TABS = [
  { value: "all", label: "All" },
  { value: "in", label: "Rental In" },
  { value: "out", label: "Rental Out" },
] as const;

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

export default function RentalListPage() {
  const queryClient = useQueryClient();
  const [directionTab, setDirectionTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const buildParams = useCallback(
    (direction: string) => {
      const next: Record<string, string> = { page: String(page) };
      if (direction !== "all") next.direction = direction;
      if (statusFilter) next.status = statusFilter;
      if (search) next.search = search;
      return next;
    },
    [page, statusFilter, search],
  );

  const prefetchDirection = useCallback(
    (direction: string) => {
      const prefetchParams = buildParams(direction);
      void queryClient.prefetchQuery({
        queryKey: ["rental-agreements", prefetchParams],
        queryFn: async () => {
          const { data } = await api.get<PaginatedResponse<RentalAgreementList>>(
            "/rentals/agreements/",
            { params: prefetchParams },
          );
          return data;
        },
      });
    },
    [buildParams, queryClient],
  );

  // Build query params
  const params = buildParams(directionTab);

  const agreements = useRentalAgreements(params);
  const { isInitialLoading, isRefreshing } = getQueryLoadState(agreements);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Rental Agreements
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage rental-in and rental-out agreements
          </p>
        </div>
        <Button size="sm" asChild>
          <Link to="/rentals/new">
            <Plus className="h-4 w-4" />
            New Agreement
          </Link>
        </Button>
      </div>

      {/* Direction Tabs */}
      <Tabs
        value={directionTab}
        onValueChange={(v) => {
          setDirectionTab(v);
          setPage(1);
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            {DIRECTION_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                onMouseEnter={() => prefetchDirection(tab.value)}
                onFocus={() => prefetchDirection(tab.value)}
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
              value={statusFilter || "all"}
              onValueChange={(v) => {
                setStatusFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table content — rendered for every tab via a single TabsContent per direction */}
        {DIRECTION_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <QueryRefreshIndicator show={isRefreshing} />
            {isInitialLoading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : agreements.data?.results.length === 0 ? (
              <EmptyState message="No rental agreements found" />
            ) : (
              <>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agreement #</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead className="text-right">Lines</TableHead>
                        <TableHead className="text-right">Equipment</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agreements.data?.results.map((agreement) => {
                        const dirCfg = DIRECTION_CONFIG[agreement.direction];
                        const statusCfg = STATUS_CONFIG[agreement.status];
                        return (
                          <TableRow key={agreement.uuid}>
                            <TableCell>
                              <Link
                                to={`/rentals/${agreement.uuid}`}
                                className="font-medium text-foreground hover:text-primary transition-colors"
                              >
                                {agreement.agreement_number}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant={dirCfg?.variant ?? "default"}>
                                {dirCfg?.label ?? agreement.direction}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusCfg?.variant ?? "outline"}>
                                {statusCfg?.label ?? agreement.status}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="max-w-[180px] truncate text-muted-foreground"
                              title={agreement.vendor_name}
                            >
                              {agreement.vendor_name || "\u2014"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDateRange(
                                agreement.start_date,
                                agreement.end_date,
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {agreement.line_count}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {agreement.equipment_count}
                            </TableCell>
                            <TableCell className="w-8">
                              <Link to={`/rentals/${agreement.uuid}`}>
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
                  count={agreements.data?.count ?? 0}
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
      <FileText className="h-10 w-10 text-muted-foreground/40" />
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
