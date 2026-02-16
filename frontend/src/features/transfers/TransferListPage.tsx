import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
  Package,
} from "lucide-react";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useTransfers,
  useTransfer,
  useExecuteTransfer,
  useCancelTransfer,
} from "@/hooks/use-transfers";
import type {
  TransferStatus,
  EquipmentTransferList,
} from "@/types/transfer";

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

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "planned", label: "Planned" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return "\u2014";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "\u2014";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Page Component ─────────────────────────────────────────────────

export default function TransferListPage() {
  const [statusTab, setStatusTab] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "execute" | "cancel";
    uuid: string;
    open: boolean;
  } | null>(null);

  // Build query params
  const params: Record<string, string> = { page: String(page) };
  if (statusTab !== "all") params.status = statusTab;

  const transfers = useTransfers(params);
  const executeMutation = useExecuteTransfer();
  const cancelMutation = useCancelTransfer();

  function handleExecute(uuid: string) {
    executeMutation.mutate(
      { uuid },
      {
        onSuccess: () => {
          toast.success("Transfer executed successfully");
          setConfirmDialog(null);
        },
        onError: () => {
          toast.error("Failed to execute transfer");
          setConfirmDialog(null);
        },
      },
    );
  }

  function handleCancel(uuid: string) {
    cancelMutation.mutate(
      { uuid },
      {
        onSuccess: () => {
          toast.success("Transfer cancelled successfully");
          setConfirmDialog(null);
        },
        onError: () => {
          toast.error("Failed to cancel transfer");
          setConfirmDialog(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Track equipment transfers between schedules
          </p>
        </div>
        <Link to="/transfers/new">
          <Button className="gap-1">
            <ArrowLeftRight className="h-4 w-4" />
            New Transfer
          </Button>
        </Link>
      </div>

      {/* Status Tabs */}
      <Tabs
        value={statusTab}
        onValueChange={(v) => {
          setStatusTab(v);
          setPage(1);
          setExpandedUuid(null);
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
        </div>

        {/* Table content */}
        {STATUS_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {transfers.isLoading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : transfers.data?.results.length === 0 ? (
              <EmptyState message="No transfers found" />
            ) : (
              <>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>From Schedule</TableHead>
                        <TableHead />
                        <TableHead>To Schedule</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Planned Date</TableHead>
                        <TableHead>Executed Date</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.data?.results.map((transfer) => (
                        <TransferRow
                          key={transfer.uuid}
                          transfer={transfer}
                          isExpanded={expandedUuid === transfer.uuid}
                          onToggleExpand={() =>
                            setExpandedUuid(
                              expandedUuid === transfer.uuid
                                ? null
                                : transfer.uuid,
                            )
                          }
                          onExecute={() =>
                            setConfirmDialog({
                              type: "execute",
                              uuid: transfer.uuid,
                              open: true,
                            })
                          }
                          onCancel={() =>
                            setConfirmDialog({
                              type: "cancel",
                              uuid: transfer.uuid,
                              open: true,
                            })
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pagination
                  count={transfers.data?.count ?? 0}
                  page={page}
                  onPageChange={setPage}
                />
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Confirm Dialog */}
      <Dialog
        open={confirmDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === "execute"
                ? "Execute Transfer"
                : "Cancel Transfer"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === "execute"
                ? "Are you sure you want to execute this transfer? Equipment will be moved between the schedules."
                : "Are you sure you want to cancel this transfer? This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(null)}
              disabled={
                executeMutation.isPending || cancelMutation.isPending
              }
            >
              Close
            </Button>
            {confirmDialog?.type === "execute" ? (
              <Button
                onClick={() => handleExecute(confirmDialog.uuid)}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? "Executing..." : "Execute"}
              </Button>
            ) : confirmDialog?.type === "cancel" ? (
              <Button
                variant="destructive"
                onClick={() => handleCancel(confirmDialog.uuid)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? "Cancelling..." : "Cancel Transfer"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Transfer Row ───────────────────────────────────────────────────

function TransferRow({
  transfer,
  isExpanded,
  onToggleExpand,
  onExecute,
  onCancel,
}: {
  transfer: EquipmentTransferList;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onExecute: () => void;
  onCancel: () => void;
}) {
  const statusCfg = STATUS_CONFIG[transfer.status];

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={onToggleExpand}
      >
        <TableCell className="w-8">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <Link
            to={`/schedules/${transfer.from_schedule.uuid}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {transfer.from_schedule.title}
          </Link>
        </TableCell>
        <TableCell className="w-8">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </TableCell>
        <TableCell>
          <Link
            to={`/schedules/${transfer.to_schedule.uuid}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {transfer.to_schedule.title}
          </Link>
        </TableCell>
        <TableCell>
          <Badge variant={statusCfg?.variant ?? "outline"}>
            {statusCfg?.label ?? transfer.status}
          </Badge>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(transfer.planned_datetime)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(transfer.executed_at)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDateTime(transfer.created_at)}
        </TableCell>
        <TableCell className="text-right">
          {transfer.status === "planned" && (
            <div
              className="flex items-center gap-1 justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1"
                onClick={onExecute}
              >
                <Check className="h-3.5 w-3.5" />
                Execute
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-destructive hover:text-destructive"
                onClick={onCancel}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 p-0">
            <TransferDetailInline uuid={transfer.uuid} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Inline Detail ──────────────────────────────────────────────────

function TransferDetailInline({ uuid }: { uuid: string }) {
  const detail = useTransfer(uuid);

  if (detail.isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-56" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Failed to load transfer details.
      </div>
    );
  }

  const { line_items, notes, performed_by, confirmed_by } = detail.data;

  return (
    <div className="p-4 space-y-3">
      {/* Meta info */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {performed_by && (
          <span>
            Performed by: <span className="text-foreground">{performed_by.full_name}</span>
          </span>
        )}
        {confirmed_by && (
          <span>
            Confirmed by: <span className="text-foreground">{confirmed_by.full_name}</span>
          </span>
        )}
        {notes && (
          <span>
            Notes: <span className="text-foreground">{notes}</span>
          </span>
        )}
      </div>

      {/* Line items table */}
      {line_items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items.</p>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment Model</TableHead>
                <TableHead>Equipment Item</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {line_items.map((item) => (
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
                  <TableCell className="text-sm text-muted-foreground">
                    {item.equipment_item
                      ? item.equipment_item.serial_number
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {item.notes || "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
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
      <ArrowLeftRight className="h-10 w-10 text-muted-foreground/40" />
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
