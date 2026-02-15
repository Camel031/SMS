import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Boxes,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  CircleDot,
  Clock,
  Ban,
  ArchiveX,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useInventorySummary,
  useInventoryByStatus,
} from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import type { EquipmentStatus } from "@/types/equipment";

// ─── Constants ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EquipmentStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }
> = {
  available: {
    label: "Available",
    variant: "success",
    icon: CircleDot,
    description: "Ready to check out",
  },
  out: {
    label: "Checked Out",
    variant: "warning",
    icon: Package,
    description: "Currently in use",
  },
  reserved: {
    label: "Reserved",
    variant: "info",
    icon: Clock,
    description: "Booked for upcoming use",
  },
  pending_receipt: {
    label: "Pending Receipt",
    variant: "secondary",
    icon: Boxes,
    description: "Awaiting delivery",
  },
  lost: {
    label: "Lost",
    variant: "destructive",
    icon: Ban,
    description: "Reported lost",
  },
  retired: {
    label: "Retired",
    variant: "outline",
    icon: ArchiveX,
    description: "No longer in service",
  },
  returned_to_vendor: {
    label: "Returned",
    variant: "outline",
    icon: Undo2,
    description: "Sent back to vendor",
  },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as EquipmentStatus[];

// ─── Page Component ──────────────────────────────────────────────────

export default function InventoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");

  const perms = usePermission();
  const summary = useInventorySummary();
  const byStatus = useInventoryByStatus(statusFilter || undefined);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            Inventory Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time equipment inventory summary and status breakdown
          </p>
        </div>
        {perms.canManageEquipment && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/equipment">
              <Package className="h-4 w-4" />
              Manage Equipment
            </Link>
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {summary.isLoading ? (
        <SummaryCardsSkeleton />
      ) : summary.data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Total Models"
            value={summary.data.total_models}
            icon={<Package className="h-5 w-5 text-primary" />}
          />
          <SummaryCard
            label="Total Items"
            value={summary.data.total_items}
            icon={<Boxes className="h-5 w-5 text-info" />}
          />
          <SummaryCard
            label="Unresolved Faults"
            value={summary.data.total_unresolved_faults}
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
            highlight={summary.data.total_unresolved_faults > 0}
          />
        </div>
      ) : null}

      {/* Status Distribution */}
      {summary.isLoading ? (
        <StatusDistributionSkeleton />
      ) : summary.data ? (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Status Distribution
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {ALL_STATUSES.map((status) => {
              const cfg = STATUS_CONFIG[status];
              const count = summary.data.by_status[status] ?? 0;
              const Icon = cfg.icon;
              return (
                <button
                  key={status}
                  onClick={() =>
                    setStatusFilter((prev) => (prev === status ? "" : status))
                  }
                  className={`group flex flex-col items-center gap-1.5 rounded-md border p-3 text-center transition-all hover:bg-secondary/50 ${
                    statusFilter === status
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border"
                  }`}
                >
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-lg font-semibold font-mono">{count}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Inventory by Status Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Equipment Models
            {statusFilter && (
              <Badge variant={STATUS_CONFIG[statusFilter as EquipmentStatus]?.variant ?? "outline"} className="ml-2">
                {STATUS_CONFIG[statusFilter as EquipmentStatus]?.label ?? statusFilter}
              </Badge>
            )}
          </h2>
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {ALL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_CONFIG[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {byStatus.isLoading ? (
          <TableSkeleton />
        ) : !byStatus.data?.length ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
            <Boxes className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {statusFilter
                ? `No models with "${STATUS_CONFIG[statusFilter as EquipmentStatus]?.label}" items`
                : "No inventory data available"}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Type</TableHead>
                  <TableHead className="text-right">
                    {statusFilter
                      ? `${STATUS_CONFIG[statusFilter as EquipmentStatus]?.label ?? "Filtered"} Count`
                      : "Total Qty"}
                  </TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {byStatus.data.map((model) => (
                  <TableRow key={model.uuid}>
                    <TableCell>
                      <Link
                        to={`/equipment/models/${model.uuid}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {model.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{model.category}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={model.is_numbered ? "outline" : "secondary"}>
                        {model.is_numbered ? "Numbered" : "Bulk"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {model.count}
                    </TableCell>
                    <TableCell className="w-8">
                      <Link to={`/equipment/models/${model.uuid}`}>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-4 ${
        highlight
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold font-mono tracking-tight">{value}</div>
    </div>
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-5 rounded" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

function StatusDistributionSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-36 mb-3" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border p-3 space-y-2 flex flex-col items-center">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-6 w-8" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: 5 }).map((_, c) => (
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
