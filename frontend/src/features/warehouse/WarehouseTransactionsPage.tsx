import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  Warehouse,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWarehouseTransactions } from "@/hooks/use-warehouse";
import type {
  TransactionType,
  TransactionStatus,
  WarehouseTransactionList,
} from "@/types/warehouse";

// ─── Config ─────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  TransactionType,
  { label: string; variant: "default" | "info" | "warning"; icon: typeof ArrowDownToLine }
> = {
  check_out: { label: "Check Out", variant: "warning", icon: ArrowUpFromLine },
  check_in: { label: "Check In", variant: "info", icon: ArrowDownToLine },
};

const STATUS_CONFIG: Record<
  TransactionStatus,
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
  pending_confirmation: { label: "Pending", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending_confirmation", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────

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

function getScheduleOrRentalLabel(tx: WarehouseTransactionList): string {
  if (tx.schedule_title) return tx.schedule_title;
  if (tx.rental_agreement_info) {
    return `${tx.rental_agreement_info.vendor_name} #${tx.rental_agreement_info.agreement_number}`;
  }
  return "\u2014";
}

// ─── Page Component ─────────────────────────────────────────────────

export default function WarehouseTransactionsPage() {
  const [statusTab, setStatusTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Build query params
  const params: Record<string, string> = { page: String(page) };
  if (statusTab !== "all") params.status = statusTab;
  if (typeFilter) params.transaction_type = typeFilter;
  if (search) params.search = search;

  const transactions = useWarehouseTransactions(params);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Warehouse Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            View check-out and check-in transaction history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/warehouse/check-out">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Check Out
            </Button>
          </Link>
          <Link to="/warehouse/check-in">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Check In
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs
        value={statusTab}
        onValueChange={(v) => {
          setStatusTab(v);
          setPage(1);
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
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
          </div>
        </div>

        {/* Table content */}
        {STATUS_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {transactions.isLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : transactions.data?.results.length === 0 ? (
              <EmptyState message="No transactions found" />
            ) : (
              <>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Schedule / Rental</TableHead>
                        <TableHead>Performed By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.data?.results.map((tx) => {
                        const typeCfg = TYPE_CONFIG[tx.transaction_type];
                        const statusCfg = STATUS_CONFIG[tx.status];
                        const TypeIcon = typeCfg.icon;
                        return (
                          <TableRow key={tx.uuid}>
                            <TableCell>
                              <Badge
                                variant={typeCfg?.variant ?? "default"}
                                className="gap-1"
                              >
                                <TypeIcon className="h-3 w-3" />
                                {typeCfg?.label ?? tx.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusCfg?.variant ?? "outline"}>
                                {statusCfg?.label ?? tx.status}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="max-w-[220px] truncate text-muted-foreground"
                              title={getScheduleOrRentalLabel(tx)}
                            >
                              <Link
                                to={`/warehouse/transactions/${tx.uuid}`}
                                className="font-medium text-foreground hover:text-primary transition-colors"
                              >
                                {getScheduleOrRentalLabel(tx)}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {tx.performed_by.full_name}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDate(tx.created_at)}
                            </TableCell>
                            <TableCell className="w-8">
                              <Link to={`/warehouse/transactions/${tx.uuid}`}>
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
                  count={transactions.data?.count ?? 0}
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
      <Warehouse className="h-10 w-10 text-muted-foreground/40" />
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
