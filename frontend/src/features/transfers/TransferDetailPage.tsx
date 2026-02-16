import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Package,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useTransfer,
  useExecuteTransfer,
  useConfirmTransfer,
  useCancelTransfer,
} from "@/hooks/use-transfers";
import type { TransferStatus } from "@/types/transfer";

// ─── Config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TransferStatus,
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
  planned: { label: "Planned", variant: "info" },
  confirmed: { label: "Confirmed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

// ─── Helpers ────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Page Component ─────────────────────────────────────────────────

export default function TransferDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const transfer = useTransfer(uuid ?? "");

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    action: "execute" | "confirm" | "cancel";
  }>({ open: false, action: "execute" });
  const [dialogNotes, setDialogNotes] = useState("");

  const executeMutation = useExecuteTransfer();
  const confirmMutation = useConfirmTransfer();
  const cancelMutation = useCancelTransfer();
  const isSubmitting =
    executeMutation.isPending ||
    confirmMutation.isPending ||
    cancelMutation.isPending;

  function openDialog(action: "execute" | "confirm" | "cancel") {
    setDialogNotes("");
    setDialogState({ open: true, action });
  }

  function closeDialog() {
    setDialogState({ open: false, action: "execute" });
    setDialogNotes("");
  }

  async function handleSubmit() {
    if (!uuid) return;
    const { action } = dialogState;
    try {
      if (action === "execute") {
        await executeMutation.mutateAsync({
          uuid,
          notes: dialogNotes || undefined,
        });
        toast.success("Transfer executed");
      } else if (action === "confirm") {
        await confirmMutation.mutateAsync({
          uuid,
          notes: dialogNotes || undefined,
        });
        toast.success("Transfer confirmed");
      } else {
        await cancelMutation.mutateAsync({
          uuid,
          notes: dialogNotes || undefined,
        });
        toast.success("Transfer cancelled");
      }
      closeDialog();
    } catch {
      toast.error(`Failed to ${action} transfer`);
    }
  }

  if (transfer.isLoading) {
    return <DetailSkeleton />;
  }

  if (transfer.isError || !transfer.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/transfers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Transfers
        </Link>
        <EmptyState message="Transfer not found" />
      </div>
    );
  }

  const tx = transfer.data;
  const statusCfg = STATUS_CONFIG[tx.status];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/transfers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Transfers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              Transfer Detail
            </h1>
            <Badge variant={statusCfg?.variant ?? "outline"}>
              {statusCfg?.label ?? tx.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {formatDateTime(tx.created_at)}
          </p>
        </div>

        {/* Actions for planned transfers */}
        {tx.status === "planned" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1"
              onClick={() => openDialog("execute")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Execute
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-destructive hover:text-destructive"
              onClick={() => openDialog("cancel")}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Info Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* From Schedule */}
        <InfoBlock label="From Schedule">
          <Link
            to={`/schedules/${tx.from_schedule.uuid}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {tx.from_schedule.title}
          </Link>
          <p className="text-xs text-muted-foreground capitalize">
            {tx.from_schedule.schedule_type.replace("_", " ")} &middot;{" "}
            {tx.from_schedule.status}
          </p>
        </InfoBlock>

        {/* Arrow */}
        <div className="hidden lg:flex items-center justify-center">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* To Schedule */}
        <InfoBlock label="To Schedule">
          <Link
            to={`/schedules/${tx.to_schedule.uuid}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {tx.to_schedule.title}
          </Link>
          <p className="text-xs text-muted-foreground capitalize">
            {tx.to_schedule.schedule_type.replace("_", " ")} &middot;{" "}
            {tx.to_schedule.status}
          </p>
        </InfoBlock>

        {/* Created By */}
        {tx.created_by && (
          <InfoBlock label="Created By" icon={User}>
            <p className="font-medium text-foreground">
              {tx.created_by.full_name}
            </p>
          </InfoBlock>
        )}

        {/* Performed By */}
        {tx.performed_by && (
          <InfoBlock label="Performed By" icon={User}>
            <p className="font-medium text-foreground">
              {tx.performed_by.full_name}
            </p>
          </InfoBlock>
        )}

        {/* Confirmed By */}
        {tx.confirmed_by && (
          <InfoBlock label="Confirmed By" icon={CheckCircle2}>
            <p className="font-medium text-foreground">
              {tx.confirmed_by.full_name}
            </p>
            {tx.confirmed_at && (
              <p className="text-xs text-muted-foreground">
                {formatDateTime(tx.confirmed_at)}
              </p>
            )}
          </InfoBlock>
        )}

        {/* Planned Date */}
        <InfoBlock label="Planned Date" icon={Clock}>
          <p className="text-sm text-foreground">
            {formatDateTime(tx.planned_datetime)}
          </p>
        </InfoBlock>

        {/* Executed At */}
        <InfoBlock label="Executed At" icon={Clock}>
          <p className="text-sm text-foreground">
            {formatDateTime(tx.executed_at)}
          </p>
        </InfoBlock>
      </div>

      {/* Notes */}
      {tx.notes && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-1">
              Notes
            </h2>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {tx.notes}
            </p>
          </div>
        </>
      )}

      <Separator />

      {/* Line Items */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Line Items ({tx.line_items.length})
        </h2>
        {tx.line_items.length === 0 ? (
          <EmptyState message="No line items" />
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment Model</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tx.line_items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {item.equipment_model.name}
                        </span>
                        {item.equipment_model.brand && (
                          <span className="text-muted-foreground">
                            ({item.equipment_model.brand})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {item.equipment_item?.serial_number ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.quantity}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-sm text-muted-foreground"
                      title={item.notes}
                    >
                      {item.notes || "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Action Dialog */}
      <Dialog
        open={dialogState.open}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState.action === "execute"
                ? "Execute Transfer"
                : dialogState.action === "confirm"
                  ? "Confirm Transfer"
                  : "Cancel Transfer"}
            </DialogTitle>
            <DialogDescription>
              {dialogState.action === "execute"
                ? "Execute this transfer. Equipment will be moved between schedules."
                : dialogState.action === "confirm"
                  ? "Confirm this transfer has been verified."
                  : "Cancel this transfer. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="transfer-action-notes">Notes (optional)</Label>
            <Textarea
              id="transfer-action-notes"
              placeholder="Add any notes..."
              value={dialogNotes}
              onChange={(e) => setDialogNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              Close
            </Button>
            <Button
              variant={
                dialogState.action === "cancel" ? "destructive" : "default"
              }
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Processing..."
                : dialogState.action === "execute"
                  ? "Execute"
                  : dialogState.action === "confirm"
                    ? "Confirm"
                    : "Cancel Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

function InfoBlock({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
      <ArrowLeftRight className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-36" />
          </div>
        ))}
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableHead key={i}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, r) => (
                <TableRow key={r}>
                  {Array.from({ length: 4 }).map((_, c) => (
                    <TableCell key={c}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
