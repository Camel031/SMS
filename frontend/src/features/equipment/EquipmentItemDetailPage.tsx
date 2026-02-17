import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  Edit,
  AlertTriangle,
  ChevronRight,
  Clock,
  Calendar,
  Shield,
  Wrench,
  CalendarDays,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEquipmentItem,
  useItemHistory,
  useFaults,
  useCreateFault,
  useResolveFault,
} from "@/hooks/use-equipment";
import { useItemRepairHistory, useItemSchedules } from "@/hooks/use-schedules";
import { usePermission } from "@/hooks/use-auth";
import type { EquipmentStatus, FaultSeverity } from "@/types/equipment";
import type { ScheduleListItem } from "@/types/schedule";
import type { ScheduleType, ScheduleStatus } from "@/types/schedule";

const STATUS_CONFIG: Record<EquipmentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  available: { label: "Available", variant: "success" },
  out: { label: "Out", variant: "warning" },
  reserved: { label: "Reserved", variant: "info" },
  pending_receipt: { label: "Pending", variant: "secondary" },
  lost: { label: "Lost", variant: "destructive" },
  retired: { label: "Retired", variant: "outline" },
  returned_to_vendor: { label: "Returned", variant: "outline" },
};

const SCHEDULE_TYPE_CONFIG: Record<ScheduleType, { label: string; variant: "default" | "warning" | "info" }> = {
  event: { label: "Event", variant: "default" },
  external_repair: { label: "Repair", variant: "warning" },
  rental_out: { label: "Rental", variant: "info" },
};

const SCHEDULE_STATUS_CONFIG: Record<ScheduleStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "info" },
  in_progress: { label: "In Progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const SEVERITY_CONFIG: Record<FaultSeverity, { label: string; variant: "secondary" | "warning" | "destructive" | "info" }> = {
  low: { label: "Low", variant: "info" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "destructive" },
  critical: { label: "Critical", variant: "destructive" },
};

export default function EquipmentItemDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const item = useEquipmentItem(uuid ?? "");
  const history = useItemHistory(uuid ?? "");
  const faults = useFaults(uuid ? { equipment_item_uuid: uuid } : undefined);
  const repairs = useItemRepairHistory(uuid ?? "");
  const schedules = useItemSchedules(uuid ?? "");
  const perms = usePermission();

  if (item.isLoading) {
    return <DetailSkeleton />;
  }

  if (!item.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <Package className="h-10 w-10 mb-3 opacity-40" />
        <p>Equipment item not found</p>
      </div>
    );
  }

  const it = item.data;
  const statusCfg = STATUS_CONFIG[it.current_status];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/equipment" className="hover:text-foreground transition-colors">
          Equipment
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{it.serial_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/equipment">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight font-mono">
                {it.serial_number}
              </h1>
              <Badge variant={statusCfg?.variant ?? "outline"}>
                {statusCfg?.label ?? it.current_status}
              </Badge>
              {it.active_fault_count > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {it.active_fault_count} fault{it.active_fault_count > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {it.model_brand && `${it.model_brand} `}{it.model_name} · {it.category_name}
            </p>
          </div>
        </div>
        {perms.canManageEquipment && (
          <div className="flex gap-2">
            <ReportFaultDialog itemUuid={uuid ?? ""} />
            <Button variant="outline" size="sm" asChild>
              <Link to={`/equipment/items/${uuid}/edit`}>
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard
          icon={Package}
          label="Internal ID"
          value={it.internal_id || "—"}
          mono
        />
        <InfoCard
          icon={Shield}
          label="Ownership"
          value={it.ownership_type === "rented_in" ? "Rented In" : "Owned"}
        />
        <InfoCard
          icon={Clock}
          label="Lamp Hours"
          value={String(it.lamp_hours)}
          mono
        />
        <InfoCard
          icon={Calendar}
          label="Warranty"
          value={it.warranty_expiry ? new Date(it.warranty_expiry).toLocaleDateString() : "—"}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">
            History ({history.data?.count ?? 0})
          </TabsTrigger>
          <TabsTrigger value="faults">
            Faults ({faults.data?.count ?? 0})
          </TabsTrigger>
          <TabsTrigger value="repairs">
            <Wrench className="h-3.5 w-3.5 mr-1" />
            Repairs ({repairs.data?.count ?? 0})
          </TabsTrigger>
          <TabsTrigger value="schedules">
            <CalendarDays className="h-3.5 w-3.5 mr-1" />
            Schedules ({schedules.data?.count ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="rounded-md border border-border p-4 space-y-3">
            <DetailRow label="Serial Number" value={it.serial_number} mono />
            <DetailRow label="Internal ID" value={it.internal_id || "—"} mono />
            <DetailRow label="Model" value={`${it.model_brand ? it.model_brand + " " : ""}${it.model_name}`} />
            <DetailRow label="Category" value={it.category_name} />
            <DetailRow label="Status" value={statusCfg?.label ?? it.current_status} />
            <DetailRow label="Ownership" value={it.ownership_type === "rented_in" ? "Rented In" : "Owned"} />
            <DetailRow label="Lamp Hours" value={String(it.lamp_hours)} mono />
            <DetailRow label="Purchase Date" value={it.purchase_date ? new Date(it.purchase_date).toLocaleDateString() : "—"} />
            <DetailRow label="Warranty Expiry" value={it.warranty_expiry ? new Date(it.warranty_expiry).toLocaleDateString() : "—"} />
            {it.notes && <DetailRow label="Notes" value={it.notes} />}

            {/* Custom Fields */}
            {Object.keys(it.custom_fields).length > 0 && (
              <>
                <div className="border-t border-border pt-3 mt-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Custom Fields
                  </span>
                </div>
                {Object.entries(it.custom_fields).map(([key, value]) => (
                  <DetailRow key={key} label={key} value={String(value ?? "—")} />
                ))}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          {history.isLoading ? (
            <HistorySkeleton />
          ) : history.data?.results.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No status history recorded.
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data?.results.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.performed_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{log.action.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.from_status || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.to_status}
                      </TableCell>
                      <TableCell className="text-sm">{log.performed_by_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="faults">
          {faults.isLoading ? (
            <HistorySkeleton />
          ) : faults.data?.results.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No faults reported.
            </div>
          ) : (
            <div className="space-y-3">
              {faults.data?.results.map((fault) => {
                const sevCfg = SEVERITY_CONFIG[fault.severity];
                return (
                  <FaultCard
                    key={fault.uuid}
                    fault={fault}
                    severityConfig={sevCfg}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="repairs">
          <ScheduleTable
            data={repairs.data?.results}
            isLoading={repairs.isLoading}
            emptyMessage="No repair records."
          />
        </TabsContent>

        <TabsContent value="schedules">
          <ScheduleTable
            data={schedules.data?.results}
            isLoading={schedules.isLoading}
            emptyMessage="No schedules found."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function InfoCard({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function FaultCard({
  fault,
  severityConfig,
}: {
  fault: {
    uuid: string;
    title: string;
    description: string;
    severity: FaultSeverity;
    is_resolved: boolean;
    resolved_at: string | null;
    reported_by_name: string | null;
    resolution_notes: string;
    created_at: string;
  };
  severityConfig: { label: string; variant: "secondary" | "warning" | "destructive" | "info" };
}) {
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState("");
  const resolve = useResolveFault(fault.uuid);

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{fault.title}</h3>
          <Badge variant={severityConfig.variant}>{severityConfig.label}</Badge>
          {fault.is_resolved && <Badge variant="success">Resolved</Badge>}
        </div>
        {!fault.is_resolved && !resolving && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResolving(true)}
          >
            Resolve
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{fault.description}</p>
      <div className="text-xs text-muted-foreground">
        Reported by {fault.reported_by_name ?? "Unknown"} ·{" "}
        {new Date(fault.created_at).toLocaleDateString()}
        {fault.is_resolved && fault.resolved_at && (
          <> · Resolved {new Date(fault.resolved_at).toLocaleDateString()}</>
        )}
      </div>
      {fault.is_resolved && fault.resolution_notes && (
        <div className="text-sm border-t border-border pt-2 mt-2">
          <span className="text-xs text-muted-foreground">Resolution: </span>
          {fault.resolution_notes}
        </div>
      )}
      {resolving && (
        <div className="border-t border-border pt-3 mt-2 space-y-2">
          <Textarea
            placeholder="Resolution notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-20"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                resolve.mutate(notes, {
                  onSuccess: () => setResolving(false),
                });
              }}
              disabled={resolve.isPending}
            >
              {resolve.isPending ? "Resolving..." : "Confirm Resolve"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResolving(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportFaultDialog({ itemUuid }: { itemUuid: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FaultSeverity>("medium");
  const createFault = useCreateFault(itemUuid);

  const handleSubmit = () => {
    createFault.mutate(
      { title, description, severity },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDescription("");
          setSeverity("medium");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <AlertTriangle className="h-3.5 w-3.5" />
          Report Fault
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Fault</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              placeholder="Brief description of the fault"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Detailed description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Severity</Label>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as FaultSeverity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title || !description || createFault.isPending}
            >
              {createFault.isPending ? "Submitting..." : "Report Fault"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleTable({
  data,
  isLoading,
  emptyMessage,
}: {
  data: ScheduleListItem[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
}) {
  if (isLoading) return <HistorySkeleton />;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Dates</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((s) => {
            const typeCfg = SCHEDULE_TYPE_CONFIG[s.schedule_type];
            const statusCfg = SCHEDULE_STATUS_CONFIG[s.status];
            const start = new Date(s.start_datetime).toLocaleDateString();
            const end = new Date(s.end_datetime).toLocaleDateString();
            return (
              <TableRow key={s.uuid}>
                <TableCell>
                  <Link
                    to={`/schedules/${s.uuid}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {s.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={typeCfg?.variant ?? "default"}>
                    {typeCfg?.label ?? s.schedule_type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusCfg?.variant ?? "secondary"}>
                    {statusCfg?.label ?? s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {start} – {end}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-32 shrink-0 text-sm text-muted-foreground">{label}</span>
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
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-md" />)}
      </div>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="rounded-md border border-border p-4">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full mb-2" />)}
    </div>
  );
}
