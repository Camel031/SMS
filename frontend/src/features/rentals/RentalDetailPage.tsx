import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Edit,
  Trash2,
  Play,
  XCircle,
  CalendarPlus,
  Plus,
  Package,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useRentalAgreement,
  useAgreementLines,
  useAgreementEquipment,
  useActivateAgreement,
  useCancelAgreement,
  useExtendAgreement,
  useDeleteRentalAgreement,
} from "@/hooks/use-rentals";
import { toast } from "sonner";
import type { RentalDirection, RentalStatus } from "@/types/rental";

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

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Page Component ─────────────────────────────────────────────────

export default function RentalDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  // State for dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [newEndDate, setNewEndDate] = useState("");

  // Queries
  const agreement = useRentalAgreement(uuid ?? "");
  const lines = useAgreementLines(uuid ?? "");
  const equipment = useAgreementEquipment(uuid ?? "");

  // Mutations
  const activateMutation = useActivateAgreement(uuid ?? "");
  const cancelMutation = useCancelAgreement(uuid ?? "");
  const extendMutation = useExtendAgreement(uuid ?? "");
  const deleteMutation = useDeleteRentalAgreement();

  // Action handlers
  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync();
      toast.success("Agreement activated");
    } catch {
      toast.error("Failed to activate agreement");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync();
      toast.success("Agreement cancelled");
      setShowCancelDialog(false);
    } catch {
      toast.error("Failed to cancel agreement");
    }
  };

  const handleExtend = async () => {
    if (!newEndDate) return;
    try {
      await extendMutation.mutateAsync({ new_end_date: newEndDate });
      toast.success("Agreement extended");
      setShowExtendDialog(false);
      setNewEndDate("");
    } catch {
      toast.error("Failed to extend agreement");
    }
  };

  const handleDelete = async () => {
    if (!uuid) return;
    try {
      await deleteMutation.mutateAsync(uuid);
      toast.success("Agreement deleted");
      navigate("/rentals");
    } catch {
      toast.error("Failed to delete agreement");
    }
  };

  // Loading state
  if (agreement.isLoading) {
    return <DetailSkeleton />;
  }

  // Not found state
  if (!agreement.isLoading && !agreement.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <p>Agreement not found</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/rentals">Back to Rental Agreements</Link>
        </Button>
      </div>
    );
  }

  const data = agreement.data!;
  const dirCfg = DIRECTION_CONFIG[data.direction];
  const statusCfg = STATUS_CONFIG[data.status];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/rentals"
          className="hover:text-foreground transition-colors"
        >
          Rental Agreements
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{data.agreement_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/rentals">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {data.agreement_number}
              </h1>
              <Badge variant={dirCfg?.variant ?? "default"}>
                {dirCfg?.label ?? data.direction}
              </Badge>
              <Badge variant={statusCfg?.variant ?? "outline"}>
                {statusCfg?.label ?? data.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{data.vendor_name}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {data.status === "draft" && (
            <>
              <Button
                size="sm"
                onClick={handleActivate}
                disabled={activateMutation.isPending}
              >
                <Play className="h-4 w-4" />
                {activateMutation.isPending ? "Activating..." : "Activate"}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/rentals/${uuid}/edit`}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          {data.status === "active" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNewEndDate(data.end_date);
                  setShowExtendDialog(true);
                }}
              >
                <CalendarPlus className="h-4 w-4" />
                Extend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
          {data.status === "returning" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNewEndDate(data.end_date);
                  setShowExtendDialog(true);
                }}
              >
                <CalendarPlus className="h-4 w-4" />
                Extend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lines">Lines</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details">
          <div className="rounded-md border border-border bg-card p-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DetailField label="Agreement #" value={data.agreement_number} />
              <DetailField
                label="Direction"
                value={dirCfg?.label ?? data.direction}
              />
              <DetailField
                label="Status"
                value={statusCfg?.label ?? data.status}
              />
              <DetailField label="Vendor" value={data.vendor_name} />
              <DetailField
                label="Contact"
                value={data.vendor_contact || "\u2014"}
              />
              <DetailField
                label="Phone"
                value={data.vendor_phone || "\u2014"}
              />
              <DetailField
                label="Email"
                value={data.vendor_email || "\u2014"}
              />
              <DetailField
                label="Start Date"
                value={formatDate(data.start_date)}
              />
              <DetailField
                label="End Date"
                value={formatDate(data.end_date)}
              />
              <DetailField
                label="Created By"
                value={data.created_by_name || "\u2014"}
              />
            </div>
            {data.notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Notes
                </p>
                <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Lines Tab */}
        <TabsContent value="lines">
          <div className="space-y-3">
            {data.status === "draft" && (
              <div className="flex justify-end">
                <Button size="sm" asChild>
                  <Link to={`/rentals/${uuid}/lines/new`}>
                    <Plus className="h-4 w-4" />
                    Add Line
                  </Link>
                </Button>
              </div>
            )}
            {lines.isLoading ? (
              <TableSkeleton rows={3} cols={5} />
            ) : !lines.data || lines.data.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-10 w-10 text-muted-foreground/40" />}
                message="No lines added yet"
              />
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment Model</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.data.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {line.equipment_model_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {line.equipment_model_brand || "\u2014"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {line.category_name || "\u2014"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {line.quantity}
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-muted-foreground"
                          title={line.notes}
                        >
                          {line.notes || "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Equipment Tab */}
        <TabsContent value="equipment">
          {equipment.isLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !equipment.data || equipment.data.length === 0 ? (
            <EmptyState
              icon={<Package className="h-10 w-10 text-muted-foreground/40" />}
              message="No equipment linked yet"
            />
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Internal ID</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.data.map((item) => (
                    <TableRow key={item.uuid}>
                      <TableCell className="font-medium font-mono text-sm">
                        {item.serial_number || "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {item.internal_id || "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.equipment_model_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.current_status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agreement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete agreement{" "}
              <strong>{data.agreement_number}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Agreement</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel agreement{" "}
              <strong>{data.agreement_number}</strong>? This will mark the
              agreement as cancelled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Agreement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Dialog */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Agreement</DialogTitle>
            <DialogDescription>
              Set a new end date for agreement{" "}
              <strong>{data.agreement_number}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="new_end_date">New End Date</Label>
            <Input
              id="new_end_date"
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowExtendDialog(false);
                setNewEndDate("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExtend}
              disabled={!newEndDate || extendMutation.isPending}
            >
              {extendMutation.isPending ? "Extending..." : "Extend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
      {icon}
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

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
      <div className="rounded-md border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
