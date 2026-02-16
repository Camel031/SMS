import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Loader2,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSchedules,
  useScheduleCheckoutRecords,
} from "@/hooks/use-schedules";
import { useCreateTransfer } from "@/hooks/use-transfers";
import type { TransferLineItemCreate } from "@/types/transfer";
import type { CheckoutRecordItem } from "@/types/schedule";

// ─── Types ─────────────────────────────────────────────────────────

interface LineItem {
  key: string;
  equipment_model_uuid: string;
  equipment_model_name: string;
  equipment_item_uuid?: string;
  equipment_item_label?: string;
  quantity: number;
  notes: string;
}

// ─── Page Component ─────────────────────────────────────────────────

export default function TransferFormPage() {
  const navigate = useNavigate();

  const [fromScheduleUuid, setFromScheduleUuid] = useState("");
  const [toScheduleUuid, setToScheduleUuid] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [plannedDatetime, setPlannedDatetime] = useState("");
  const [notes, setNotes] = useState("");

  // Queries
  const schedules = useSchedules();
  const checkoutRecords = useScheduleCheckoutRecords(fromScheduleUuid);
  const createTransfer = useCreateTransfer();

  // Get records not already added
  const availableRecords = checkoutRecords.data?.filter(
    (r) =>
      !lineItems.some(
        (li) =>
          li.equipment_item_uuid === r.equipment_item?.uuid &&
          li.equipment_item_uuid,
      ),
  );

  function handleAddRecord(record: CheckoutRecordItem) {
    const newLine: LineItem = {
      key: `${record.id}-${Date.now()}`,
      equipment_model_uuid: "", // Will need to be resolved
      equipment_model_name: record.equipment_model_name,
      equipment_item_uuid: record.equipment_item?.uuid,
      equipment_item_label: record.equipment_item?.serial_number,
      quantity: record.equipment_item ? 1 : record.quantity_still_out,
      notes: "",
    };
    setLineItems((prev) => [...prev, newLine]);
  }

  function handleRemoveItem(key: string) {
    setLineItems((prev) => prev.filter((li) => li.key !== key));
  }

  async function handleSubmit() {
    if (!fromScheduleUuid || !toScheduleUuid) {
      toast.error("Select both source and destination schedules");
      return;
    }
    if (fromScheduleUuid === toScheduleUuid) {
      toast.error("Source and destination must be different schedules");
      return;
    }
    if (lineItems.length === 0) {
      toast.error("Add at least one item to transfer");
      return;
    }

    const items: TransferLineItemCreate[] = lineItems.map((li) => ({
      equipment_model_uuid: li.equipment_model_uuid,
      equipment_item_uuid: li.equipment_item_uuid,
      quantity: li.quantity,
      notes: li.notes,
    }));

    try {
      await createTransfer.mutateAsync({
        from_schedule_uuid: fromScheduleUuid,
        to_schedule_uuid: toScheduleUuid,
        items,
        planned_datetime: plannedDatetime || undefined,
        notes,
      });
      toast.success("Transfer created successfully");
      navigate("/transfers");
    } catch {
      toast.error("Failed to create transfer");
    }
  }

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          New Transfer
        </h1>
        <p className="text-sm text-muted-foreground">
          Transfer equipment between schedules
        </p>
      </div>

      <Separator />

      {/* Schedule Selection */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>From Schedule</Label>
          <Select
            value={fromScheduleUuid}
            onValueChange={(v) => {
              setFromScheduleUuid(v);
              setLineItems([]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select source schedule..." />
            </SelectTrigger>
            <SelectContent>
              {schedules.data?.results
                .filter((s) => s.uuid !== toScheduleUuid)
                .map((s) => (
                  <SelectItem key={s.uuid} value={s.uuid}>
                    {s.title} ({s.status})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>To Schedule</Label>
          <Select
            value={toScheduleUuid}
            onValueChange={setToScheduleUuid}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select destination schedule..." />
            </SelectTrigger>
            <SelectContent>
              {schedules.data?.results
                .filter((s) => s.uuid !== fromScheduleUuid)
                .map((s) => (
                  <SelectItem key={s.uuid} value={s.uuid}>
                    {s.title} ({s.status})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Available Items from Source Schedule */}
      {fromScheduleUuid && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Checked-Out Items (available for transfer)
            </h2>

            {checkoutRecords.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !availableRecords?.length ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-12">
                <Package className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No items available for transfer
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Serial Number</TableHead>
                      <TableHead className="text-right">Qty Out</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.equipment_model_name}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {record.equipment_item?.serial_number ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {record.quantity_still_out}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1"
                            onClick={() => handleAddRecord(record)}
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Selected Items */}
      {lineItems.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Items to Transfer ({lineItems.length})
            </h2>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((li) => (
                    <TableRow key={li.key}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">
                            {li.equipment_model_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {li.equipment_item_label ?? "\u2014"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {li.quantity}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Notes..."
                          value={li.notes}
                          onChange={(e) =>
                            setLineItems((prev) =>
                              prev.map((item) =>
                                item.key === li.key
                                  ? { ...item, notes: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="h-7 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveItem(li.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Options */}
      <Separator />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Planned Date/Time (optional)</Label>
          <Input
            type="datetime-local"
            value={plannedDatetime}
            onChange={(e) => setPlannedDatetime(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          placeholder="Add any notes about this transfer..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={
            !fromScheduleUuid ||
            !toScheduleUuid ||
            lineItems.length === 0 ||
            createTransfer.isPending
          }
          className="gap-2"
        >
          {createTransfer.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-4 w-4" />
          )}
          {createTransfer.isPending ? "Creating..." : "Create Transfer"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/transfers")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
