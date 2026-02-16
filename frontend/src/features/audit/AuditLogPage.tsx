import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  ScrollText,
  Package,
  CalendarRange,
  Warehouse,
  FileText,
  ArrowLeftRight,
  Users,
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
import { useAuditLogs } from "@/hooks/use-audit";
import { getQueryLoadState } from "@/lib/query-load-state";
import type { AuditCategory, AuditLog } from "@/types/audit";

const CATEGORY_CONFIG: Record<
  AuditCategory,
  { label: string; icon: typeof ScrollText; variant: "default" | "info" | "warning" | "secondary" | "outline" }
> = {
  equipment: { label: "Equipment", icon: Package, variant: "default" },
  schedule: { label: "Schedule", icon: CalendarRange, variant: "info" },
  warehouse: { label: "Warehouse", icon: Warehouse, variant: "warning" },
  rental: { label: "Rental", icon: FileText, variant: "secondary" },
  transfer: { label: "Transfer", icon: ArrowLeftRight, variant: "outline" },
  user: { label: "User", icon: Users, variant: "default" },
};

function getEntityLink(log: AuditLog): string | null {
  if (!log.entity_uuid) return null;
  switch (log.entity_type) {
    case "schedule":
      return `/schedules/${log.entity_uuid}`;
    case "equipment_item":
      return `/equipment/items/${log.entity_uuid}`;
    case "warehouse_transaction":
      return `/warehouse/transactions/${log.entity_uuid}`;
    case "rental_agreement":
      return `/rentals/${log.entity_uuid}`;
    default:
      return null;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page) };
  if (categoryFilter) params.category = categoryFilter;
  if (search) params.search = search;

  const auditLogs = useAuditLogs(params);
  const { isInitialLoading, isRefreshing } = getQueryLoadState(auditLogs);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Complete trail of all system actions
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-56 pl-8 h-8 text-sm"
          />
        </div>
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
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <QueryRefreshIndicator show={isRefreshing} />
      {isInitialLoading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : auditLogs.data?.results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
          <ScrollText className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No audit logs found
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.data?.results.map((log) => {
                  const cfg = CATEGORY_CONFIG[log.category];
                  const link = getEntityLink(log);

                  return (
                    <TableRow key={log.uuid}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg?.variant ?? "outline"} className="text-[10px]">
                          {cfg?.label ?? log.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.action}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.user_display}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground" title={log.description}>
                        {log.description}
                      </TableCell>
                      <TableCell>
                        {log.entity_display ? (
                          link ? (
                            <Link
                              to={link}
                              className="text-sm text-primary hover:underline"
                            >
                              {log.entity_display}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {log.entity_display}
                            </span>
                          )
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {"\u2014"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination
            count={auditLogs.data?.count ?? 0}
            page={page}
            onPageChange={setPage}
          />
        </>
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
        {count} total entries
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
