import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Warehouse,
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
  useWarehouseTransaction,
  useConfirmTransaction,
  useCancelTransaction,
} from "@/hooks/use-warehouse";
import type { TransactionType, TransactionStatus } from "@/types/warehouse";

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
  pending_confirmation: { label: "Pending Confirmation", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Page Component ─────────────────────────────────────────────────

export default function WarehouseTransactionDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const transaction = useWarehouseTransaction(uuid ?? "");

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    action: "confirm" | "cancel";
  }>({ open: false, action: "confirm" });
  const [notes, setNotes] = useState("");

  const confirmMutation = useConfirmTransaction();
  const cancelMutation = useCancelTransaction();
  const isSubmitting = confirmMutation.isPending || cancelMutation.isPending;

  function openDialog(action: "confirm" | "cancel") {
    setNotes("");
    setDialogState({ open: true, action });
  }

  function closeDialog() {
    setDialogState({ open: false, action: "confirm" });
    setNotes("");
  }

  async function handleSubmit() {
    if (!uuid) return;
    const { action } = dialogState;
    try {
      if (action === "confirm") {
        await confirmMutation.mutateAsync({ uuid, notes: notes || undefined });
        toast.success("Transaction confirmed");
      } else {
        await cancelMutation.mutateAsync({ uuid, notes: notes || undefined });
        toast.success("Transaction cancelled");
      }
      closeDialog();
    } catch {
      toast.error(
        action === "confirm"
          ? "Failed to confirm transaction"
          : "Failed to cancel transaction",
      );
    }
  }

  if (transaction.isLoading) {
    return <DetailSkeleton />;
  }

  if (transaction.isError || !transaction.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/warehouse/transactions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Transactions
        </Link>
        <EmptyState message="Transaction not found" />
      </div>
    );
  }

  const tx = transaction.data;
  const typeCfg = TYPE_CONFIG[tx.transaction_type];
  const statusCfg = STATUS_CONFIG[tx.status];
  const TypeIcon = typeCfg.icon;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/warehouse/transactions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Transactions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              Transaction Detail
            </h1>
            <Badge variant={typeCfg?.variant ?? "default"} className="gap-1">
              <TypeIcon className="h-3 w-3" />
              {typeCfg?.label ?? tx.transaction_type}
            </Badge>
            <Badge variant={statusCfg?.variant ?? "outline"}>
              {statusCfg?.label ?? tx.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created {formatDateTime(tx.created_at)}
          </p>
        </div>

        {/* Actions for pending transactions */}
        {tx.status === "pending_confirmation" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1"
              onClick={() => openDialog("confirm")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm
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
        {/* Schedule / Rental */}
        {tx.schedule && (
          <InfoBlock label="Schedule">
            <Link
              to={`/schedules/${tx.schedule.uuid}`}
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              {tx.schedule.title}
            </Link>
            <p className="text-xs text-muted-foreground capitalize">
              {tx.schedule.schedule_type.replace("_", " ")} &middot;{" "}
              {tx.schedule.status}
            </p>
          </InfoBlock>
        )}
        {tx.rental_agreement && (
          <InfoBlock label="Rental Agreement">
            <p className="font-medium text-foreground">
              {tx.rental_agreement.vendor_name}
            </p>
            <p className="text-xs text-muted-foreground">
              #{tx.rental_agreement.agreement_number} &middot;{" "}
              {tx.rental_agreement.direction}
            </p>
          </InfoBlock>
        )}

        {/* Performed By */}
        <InfoBlock label="Performed By" icon={User}>
          <p className="font-medium text-foreground">
            {tx.performed_by.full_name}
          </p>
        </InfoBlock>

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

        {/* Timestamps */}
        <InfoBlock label="Created" icon={Clock}>
          <p className="text-sm text-foreground">
            {formatDateTime(tx.created_at)}
          </p>
        </InfoBlock>
        <InfoBlock label="Last Updated" icon={Clock}>
          <p className="text-sm text-foreground">
            {formatDateTime(tx.updated_at)}
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
                  <TableHead>Condition</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tx.line_items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {item.equipment_model.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.equipment_model.brand} &middot;{" "}
                          {item.equipment_model.category_name}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {item.equipment_item?.serial_number ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.condition_on_return || "\u2014"}
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

      {/* Confirm / Cancel Dialog */}
      <Dialog open={dialogState.open} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState.action === "confirm"
                ? "Confirm Transaction"
                : "Cancel Transaction"}
            </DialogTitle>
            <DialogDescription>
              {dialogState.action === "confirm"
                ? "Confirm that this warehouse transaction has been verified."
                : "Cancel this warehouse transaction. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="detail-action-notes">Notes (optional)</Label>
            <Textarea
              id="detail-action-notes"
              placeholder="Add any notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              Close
            </Button>
            <Button
              variant={dialogState.action === "cancel" ? "destructive" : "default"}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Processing..."
                : dialogState.action === "confirm"
                  ? "Confirm"
                  : "Cancel Transaction"}
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
      <Warehouse className="h-10 w-10 text-muted-foreground/40" />
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
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableHead key={i}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, r) => (
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
      </div>
    </div>
  );
}
