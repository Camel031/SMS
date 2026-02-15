import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Warehouse,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  usePendingConfirmations,
  useConfirmTransaction,
  useCancelTransaction,
} from "@/hooks/use-warehouse";
import type {
  TransactionType,
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

export default function PendingConfirmationsPage() {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    action: "confirm" | "cancel";
    uuid: string;
  }>({ open: false, action: "confirm", uuid: "" });
  const [notes, setNotes] = useState("");

  const pending = usePendingConfirmations();
  const confirmMutation = useConfirmTransaction();
  const cancelMutation = useCancelTransaction();

  const isSubmitting = confirmMutation.isPending || cancelMutation.isPending;

  function openDialog(action: "confirm" | "cancel", uuid: string) {
    setNotes("");
    setDialogState({ open: true, action, uuid });
  }

  function closeDialog() {
    setDialogState({ open: false, action: "confirm", uuid: "" });
    setNotes("");
  }

  async function handleSubmit() {
    const { action, uuid } = dialogState;
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Pending Confirmations
        </h1>
        <p className="text-sm text-muted-foreground">
          Transactions awaiting warehouse confirmation
        </p>
      </div>

      {/* Content */}
      {pending.isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : pending.data?.results.length === 0 ? (
        <EmptyState message="No pending confirmations" />
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Schedule / Rental</TableHead>
                <TableHead>Performed By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.data?.results.map((tx) => {
                const typeCfg = TYPE_CONFIG[tx.transaction_type];
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
                    <TableCell
                      className="max-w-[220px] truncate"
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openDialog("confirm", tx.uuid)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => openDialog("cancel", tx.uuid)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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
            <Label htmlFor="action-notes">Notes (optional)</Label>
            <Textarea
              id="action-notes"
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
