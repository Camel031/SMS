import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Plus,
  ChevronRight,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  PlayCircle,
  Calendar,
  Package,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useSchedule,
  useScheduleEquipment,
  useConfirmSchedule,
  useCompleteSchedule,
  useCancelSchedule,
  useReopenSchedule,
  useDeleteScheduleEquipment,
} from "@/hooks/use-schedules";
import { usePermission } from "@/hooks/use-auth";
import type { ScheduleType, ScheduleStatus } from "@/types/schedule";
import { toast } from "sonner";

// ─── Config Maps ─────────────────────────────────────────────────────

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

const TYPE_CONFIG: Record<ScheduleType, { label: string; variant: BadgeVariant }> = {
  event: { label: "Event", variant: "default" },
  external_repair: { label: "Repair", variant: "warning" },
  rental_out: { label: "Rental", variant: "info" },
};

const STATUS_CONFIG: Record<ScheduleStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "info" },
  in_progress: { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

// ─── Main Component ──────────────────────────────────────────────────

export default function ScheduleDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const schedule = useSchedule(uuid ?? "");
  const equipment = useScheduleEquipment(uuid ?? "");
  const perms = usePermission();

  const confirmMutation = useConfirmSchedule(uuid ?? "");
  const completeMutation = useCompleteSchedule(uuid ?? "");
  const cancelMutation = useCancelSchedule(uuid ?? "");
  const reopenMutation = useReopenSchedule(uuid ?? "");
  const deleteEquipmentMutation = useDeleteScheduleEquipment(uuid ?? "");

  if (schedule.isLoading) {
    return <DetailSkeleton />;
  }

  if (!schedule.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <Calendar className="h-10 w-10 mb-3 opacity-40" />
        <p>Schedule not found</p>
      </div>
    );
  }

  const s = schedule.data;
  const typeCfg = TYPE_CONFIG[s.schedule_type];
  const statusCfg = STATUS_CONFIG[s.status];

  const handleConfirm = () => {
    confirmMutation.mutate(undefined, {
      onSuccess: () => toast.success("Schedule confirmed"),
      onError: () => toast.error("Failed to confirm schedule"),
    });
  };

  const handleComplete = () => {
    completeMutation.mutate(undefined, {
      onSuccess: () => toast.success("Schedule completed"),
      onError: () => toast.error("Failed to complete schedule"),
    });
  };

  const handleCancel = (force = false) => {
    cancelMutation.mutate(
      { force, reason: force ? "Force cancelled" : undefined },
      {
        onSuccess: () => toast.success("Schedule cancelled"),
        onError: () => toast.error("Failed to cancel schedule"),
      },
    );
  };

  const handleReopen = () => {
    reopenMutation.mutate(undefined, {
      onSuccess: () => toast.success("Schedule reopened"),
      onError: () => toast.error("Failed to reopen schedule"),
    });
  };

  const handleDeleteEquipment = (pk: number) => {
    deleteEquipmentMutation.mutate(pk, {
      onSuccess: () => toast.success("Equipment removed"),
      onError: () => toast.error("Failed to remove equipment"),
    });
  };

  const isActionLoading =
    confirmMutation.isPending ||
    completeMutation.isPending ||
    cancelMutation.isPending ||
    reopenMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/schedules" className="hover:text-foreground transition-colors">
          Schedules
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{s.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/schedules">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{s.title}</h1>
              <Badge variant={typeCfg?.variant ?? "outline"}>
                {typeCfg?.label ?? s.schedule_type}
              </Badge>
              <Badge variant={statusCfg?.variant ?? "outline"}>
                {statusCfg?.label ?? s.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(s.start_datetime)} &mdash; {formatDate(s.end_datetime)}
              {s.location && <> &middot; {s.location}</>}
            </p>
          </div>
        </div>
        {perms.canManageSchedules && (
          <div className="flex gap-2">
            {s.status === "draft" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/schedules/${uuid}/edit`}>
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={isActionLoading}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {confirmMutation.isPending ? "Confirming..." : "Confirm"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancel()}
                  disabled={isActionLoading}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to delete this schedule?")) {
                      navigate("/schedules");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}
            {s.status === "confirmed" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/schedules/${uuid}/edit`}>
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancel()}
                  disabled={isActionLoading}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
                </Button>
              </>
            )}
            {s.status === "in_progress" && (
              <>
                <Button
                  size="sm"
                  onClick={handleComplete}
                  disabled={isActionLoading}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {completeMutation.isPending ? "Completing..." : "Complete"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleCancel(true)}
                  disabled={isActionLoading}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {cancelMutation.isPending ? "Cancelling..." : "Cancel (Force)"}
                </Button>
              </>
            )}
            {s.status === "cancelled" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopen}
                disabled={isActionLoading}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {reopenMutation.isPending ? "Reopening..." : "Reopen"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Info Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="h-3 w-3" />
            Schedule Type
          </div>
          <div className="mt-1">
            <Badge variant={typeCfg?.variant ?? "outline"}>
              {typeCfg?.label ?? s.schedule_type}
            </Badge>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Status
          </div>
          <div className="mt-1">
            <Badge variant={statusCfg?.variant ?? "outline"}>
              {statusCfg?.label ?? s.status}
            </Badge>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Date Range
          </div>
          <div className="mt-1 text-sm font-semibold">
            {formatDate(s.start_datetime)} &mdash; {formatDate(s.end_datetime)}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="h-3 w-3" />
            Equipment
          </div>
          <div className="mt-1 text-lg font-semibold font-mono">
            {s.equipment_count}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="equipment">
        <TabsList>
          <TabsTrigger value="equipment">
            Equipment ({equipment.data?.length ?? s.equipment_count})
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="dispatch">
            Dispatch Events ({s.dispatch_events?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Equipment Tab ──────────────────────────────────────────── */}
        <TabsContent value="equipment">
          <div className="space-y-3">
            {perms.canManageSchedules &&
              s.status !== "completed" &&
              s.status !== "cancelled" && (
                <div className="flex justify-end">
                  <Button size="sm" asChild>
                    <Link to={`/schedules/${uuid}/equipment/add`}>
                      <Plus className="h-3.5 w-3.5" />
                      Add Equipment
                    </Link>
                  </Button>
                </div>
              )}

            {equipment.isLoading ? (
              <TableSkeleton />
            ) : !equipment.data || equipment.data.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No equipment allocated to this schedule yet.
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment</TableHead>
                      <TableHead className="text-center">Qty Planned</TableHead>
                      <TableHead className="text-center">Checked Out</TableHead>
                      <TableHead className="text-center">Returned</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipment.data.map((alloc) => (
                      <TableRow key={alloc.id}>
                        <TableCell>
                          <div>
                            <Link
                              to={`/equipment/models/${alloc.equipment_model.uuid}`}
                              className="text-sm font-medium hover:text-primary transition-colors"
                            >
                              {alloc.equipment_model.brand && (
                                <span className="text-muted-foreground">
                                  {alloc.equipment_model.brand}{" "}
                                </span>
                              )}
                              {alloc.equipment_model.name}
                            </Link>
                            {alloc.equipment_model.category_name && (
                              <div className="mt-0.5">
                                <Badge variant="outline" className="text-[10px]">
                                  {alloc.equipment_model.category_name}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {alloc.quantity_planned}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {alloc.quantity_checked_out}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {alloc.quantity_returned}
                        </TableCell>
                        <TableCell>
                          {alloc.is_over_allocated && (
                            <Badge variant="warning" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Over-allocated
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="w-8">
                          {perms.canManageSchedules &&
                            s.status !== "completed" &&
                            s.status !== "cancelled" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteEquipment(alloc.id)}
                                disabled={deleteEquipmentMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Details Tab ────────────────────────────────────────────── */}
        <TabsContent value="details">
          <div className="rounded-md border border-border p-4 space-y-3">
            <DetailRow label="Contact Name" value={s.contact_name || "—"} />
            <DetailRow label="Contact Phone" value={s.contact_phone || "—"} />
            <DetailRow label="Contact Email" value={s.contact_email || "—"} />
            <DetailRow label="Location" value={s.location || "—"} />
            <DetailRow label="Notes" value={s.notes || "—"} />

            {s.schedule_type === "external_repair" && (
              <DetailRow
                label="Expected Return"
                value={formatDate(s.expected_return_date)}
              />
            )}

            <div className="border-t border-border pt-3 mt-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Timestamps
              </span>
            </div>
            <DetailRow label="Created At" value={formatDateTime(s.created_at)} />
            <DetailRow label="Updated At" value={formatDateTime(s.updated_at)} />
            <DetailRow
              label="Confirmed At"
              value={formatDateTime(s.confirmed_at)}
            />
            <DetailRow
              label="Confirmed By"
              value={s.confirmed_by?.full_name ?? "—"}
            />
            <DetailRow
              label="Started At"
              value={formatDateTime(s.started_at)}
            />
            <DetailRow
              label="Completed At"
              value={formatDateTime(s.completed_at)}
            />

            {s.status === "cancelled" && (
              <>
                <div className="border-t border-border pt-3 mt-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Cancellation
                  </span>
                </div>
                <DetailRow
                  label="Cancelled At"
                  value={formatDateTime(s.cancelled_at)}
                />
                <DetailRow
                  label="Cancelled By"
                  value={s.cancelled_by?.full_name ?? "—"}
                />
                <DetailRow
                  label="Reason"
                  value={s.cancellation_reason || "—"}
                />
              </>
            )}
          </div>
        </TabsContent>

        {/* ── Dispatch Events Tab ────────────────────────────────────── */}
        <TabsContent value="dispatch">
          <div className="space-y-3">
            {perms.canManageSchedules &&
              s.status !== "completed" &&
              s.status !== "cancelled" && (
                <div className="flex justify-end">
                  <Button size="sm" asChild>
                    <Link to={`/schedules/new?parent=${uuid}`}>
                      <Plus className="h-3.5 w-3.5" />
                      Add Dispatch Event
                    </Link>
                  </Button>
                </div>
              )}

            {!s.dispatch_events || s.dispatch_events.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No dispatch events linked to this schedule.
              </div>
            ) : (
              <div className="space-y-2">
                {s.dispatch_events.map((child) => {
                  const childType = TYPE_CONFIG[child.schedule_type];
                  const childStatus = STATUS_CONFIG[child.status];
                  return (
                    <Link
                      key={child.uuid}
                      to={`/schedules/${child.uuid}`}
                      className="flex items-center justify-between rounded-md border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{child.title}</span>
                            <Badge variant={childType?.variant ?? "outline"}>
                              {childType?.label ?? child.schedule_type}
                            </Badge>
                            <Badge variant={childStatus?.variant ?? "outline"}>
                              {childStatus?.label ?? child.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(child.start_datetime)} &mdash;{" "}
                            {formatDate(child.end_datetime)}
                            {child.location && <> &middot; {child.location}</>}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── History Tab ────────────────────────────────────────────── */}
        <TabsContent value="history">
          {!s.equipment_allocations ? (
            <HistorySkeleton />
          ) : (
            <StatusHistory scheduleUuid={uuid ?? ""} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Status History Sub-component ────────────────────────────────────

function StatusHistory({ scheduleUuid }: { scheduleUuid: string }) {
  const schedule = useSchedule(scheduleUuid);

  // Build a synthetic timeline from the ScheduleDetail timestamps
  // The backend may expose status_logs in the future. For now we
  // reconstruct from the detail fields.
  if (schedule.isLoading) return <HistorySkeleton />;
  if (!schedule.data) return null;

  const s = schedule.data;
  const entries: {
    key: string;
    status: ScheduleStatus;
    by: string;
    at: string;
    notes: string;
  }[] = [];

  entries.push({
    key: "created",
    status: "draft",
    by: s.created_by?.full_name ?? "System",
    at: s.created_at,
    notes: "Schedule created",
  });

  if (s.confirmed_at) {
    entries.push({
      key: "confirmed",
      status: "confirmed",
      by: s.confirmed_by?.full_name ?? "—",
      at: s.confirmed_at,
      notes: "Schedule confirmed",
    });
  }

  if (s.started_at) {
    entries.push({
      key: "started",
      status: "in_progress",
      by: "—",
      at: s.started_at,
      notes: "Schedule started",
    });
  }

  if (s.completed_at) {
    entries.push({
      key: "completed",
      status: "completed",
      by: "—",
      at: s.completed_at,
      notes: "Schedule completed",
    });
  }

  if (s.cancelled_at) {
    entries.push({
      key: "cancelled",
      status: "cancelled",
      by: s.cancelled_by?.full_name ?? "—",
      at: s.cancelled_at,
      notes: s.cancellation_reason || "Schedule cancelled",
    });
  }

  // Sort newest first
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No history available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const cfg = STATUS_CONFIG[entry.status];
        return (
          <div
            key={entry.key}
            className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
          >
            <div className="mt-0.5">
              <Badge variant={cfg?.variant ?? "outline"}>
                {cfg?.label ?? entry.status}
              </Badge>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{entry.notes}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                by {entry.by} &middot; {relativeTime(entry.at)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDateTime(entry.at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared Sub-components ───────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-36 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((r) => (
            <TableRow key={r}>
              {[1, 2, 3, 4, 5, 6].map((c) => (
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

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-md" />
      ))}
    </div>
  );
}
