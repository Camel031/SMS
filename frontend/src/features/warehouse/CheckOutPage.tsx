import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpFromLine,
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { useSchedules, useScheduleEquipment } from "@/hooks/use-schedules";
import { useRentalAgreements } from "@/hooks/use-rentals";
import { useEquipmentItems } from "@/hooks/use-equipment";
import { useCheckOut } from "@/hooks/use-warehouse";
import type { TransactionLineItemCreate } from "@/types/warehouse";
import type { ScheduleEquipmentItem } from "@/types/schedule";

// ─── Types ─────────────────────────────────────────────────────────

type ContextType = "schedule" | "rental";

interface LineItem {
  key: string;
  equipment_model_uuid: string;
  equipment_model_name: string;
  equipment_item_uuid?: string;
  equipment_item_label?: string;
  is_numbered: boolean;
  quantity: number;
  notes: string;
}

// ─── Page Component ─────────────────────────────────────────────────

export default function CheckOutPage() {
  const navigate = useNavigate();
  const [contextType, setContextType] = useState<ContextType>("schedule");
  const [selectedUuid, setSelectedUuid] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [notes, setNotes] = useState("");

  // Adding item state
  const [addingModelUuid, setAddingModelUuid] = useState("");
  const [addingItemUuid, setAddingItemUuid] = useState("");
  const [addingQuantity, setAddingQuantity] = useState(1);

  // Queries
  const schedules = useSchedules({ status: "confirmed" });
  const rentals = useRentalAgreements({ status: "active" });
  const scheduleEquipment = useScheduleEquipment(
    contextType === "schedule" ? selectedUuid : "",
  );

  // Get available items for the selected model (for numbered equipment)
  const selectedAllocation = scheduleEquipment.data?.find(
    (a) => String(a.equipment_model.uuid) === addingModelUuid,
  );
  const isNumbered = selectedAllocation?.equipment_model.is_numbered ?? false;

  const items = useEquipmentItems(
    isNumbered && addingModelUuid
      ? { equipment_model: addingModelUuid, current_status: "available" }
      : undefined,
  );

  const checkOutMutation = useCheckOut();

  function handleContextChange(uuid: string) {
    setSelectedUuid(uuid);
    setLineItems([]);
    setAddingModelUuid("");
  }

  function handleAddItem() {
    if (!addingModelUuid) return;

    const allocation = scheduleEquipment.data?.find(
      (a) => String(a.equipment_model.uuid) === addingModelUuid,
    );
    if (!allocation) return;

    const item = items.data?.results.find(
      (i) => String(i.uuid) === addingItemUuid,
    );

    const newLine: LineItem = {
      key: `${addingModelUuid}-${addingItemUuid || Date.now()}`,
      equipment_model_uuid: addingModelUuid,
      equipment_model_name: `${allocation.equipment_model.name} (${allocation.equipment_model.brand})`,
      is_numbered: allocation.equipment_model.is_numbered,
      equipment_item_uuid: addingItemUuid || undefined,
      equipment_item_label: item
        ? item.serial_number
        : undefined,
      quantity: allocation.equipment_model.is_numbered ? 1 : addingQuantity,
      notes: "",
    };

    setLineItems((prev) => [...prev, newLine]);
    setAddingModelUuid("");
    setAddingItemUuid("");
    setAddingQuantity(1);
  }

  function handleRemoveItem(key: string) {
    setLineItems((prev) => prev.filter((li) => li.key !== key));
  }

  async function handleSubmit() {
    if (lineItems.length === 0) {
      toast.error("Add at least one item to check out");
      return;
    }

    const payload: {
      schedule_uuid?: string;
      rental_agreement_uuid?: string;
      items: TransactionLineItemCreate[];
      requires_confirmation: boolean;
      notes: string;
    } = {
      items: lineItems.map((li) => ({
        equipment_model_uuid: li.equipment_model_uuid,
        equipment_item_uuid: li.equipment_item_uuid,
        quantity: li.quantity,
        notes: li.notes,
      })),
      requires_confirmation: requiresConfirmation,
      notes,
    };

    if (contextType === "schedule") {
      payload.schedule_uuid = selectedUuid;
    } else {
      payload.rental_agreement_uuid = selectedUuid;
    }

    try {
      const result = await checkOutMutation.mutateAsync(payload);
      toast.success("Check-out created successfully");
      navigate(`/warehouse/transactions/${result.uuid}`);
    } catch {
      toast.error("Failed to create check-out");
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/warehouse"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Warehouse
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ArrowUpFromLine className="h-5 w-5" />
          Check Out Equipment
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a schedule or rental agreement, then add equipment to check out
        </p>
      </div>

      <Separator />

      {/* Context Selection */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Context Type</Label>
          <Select
            value={contextType}
            onValueChange={(v) => {
              setContextType(v as ContextType);
              setSelectedUuid("");
              setLineItems([]);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="schedule">Schedule</SelectItem>
              <SelectItem value="rental">Rental Agreement</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>
            {contextType === "schedule" ? "Schedule" : "Rental Agreement"}
          </Label>
          <Select value={selectedUuid} onValueChange={handleContextChange}>
            <SelectTrigger>
              <SelectValue
                placeholder={`Select ${contextType === "schedule" ? "schedule" : "agreement"}...`}
              />
            </SelectTrigger>
            <SelectContent>
              {contextType === "schedule"
                ? schedules.data?.results.map((s) => (
                    <SelectItem key={s.uuid} value={s.uuid}>
                      {s.title}
                    </SelectItem>
                  ))
                : rentals.data?.results.map((r) => (
                    <SelectItem key={r.uuid} value={r.uuid}>
                      {r.vendor_name} #{r.agreement_number}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Add Equipment */}
      {selectedUuid && contextType === "schedule" && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Add Equipment
            </h2>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1 min-w-[200px]">
                <Label className="text-xs">Equipment Model</Label>
                <Select
                  value={addingModelUuid}
                  onValueChange={(v) => {
                    setAddingModelUuid(v);
                    setAddingItemUuid("");
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scheduleEquipment.data?.map((alloc) => (
                      <SelectItem
                        key={alloc.equipment_model.uuid}
                        value={alloc.equipment_model.uuid}
                      >
                        {alloc.equipment_model.name} (planned:{" "}
                        {alloc.quantity_planned})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isNumbered && addingModelUuid && (
                <div className="space-y-1 min-w-[180px]">
                  <Label className="text-xs">Serial Number</Label>
                  <Select
                    value={addingItemUuid}
                    onValueChange={setAddingItemUuid}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {items.data?.results.map((item) => (
                        <SelectItem key={item.uuid} value={item.uuid}>
                          {item.serial_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isNumbered && addingModelUuid && (
                <div className="space-y-1 w-24">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={addingQuantity}
                    onChange={(e) =>
                      setAddingQuantity(Number(e.target.value) || 1)
                    }
                    className="h-9"
                  />
                </div>
              )}

              <Button
                size="sm"
                className="h-9 gap-1"
                onClick={handleAddItem}
                disabled={
                  !addingModelUuid || (isNumbered && !addingItemUuid)
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>
        </>
      )}

      {/* For rental context: simpler item addition */}
      {selectedUuid && contextType === "rental" && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Add Equipment
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter equipment model UUIDs directly for rental check-out.
            </p>
          </div>
        </>
      )}

      {/* Line Items Table */}
      {lineItems.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Items to Check Out ({lineItems.length})
            </h2>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment Model</TableHead>
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
      {selectedUuid && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="requires-confirmation"
                checked={requiresConfirmation}
                onCheckedChange={(v) =>
                  setRequiresConfirmation(v === true)
                }
              />
              <Label htmlFor="requires-confirmation" className="text-sm">
                Requires dual-person confirmation
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes about this check-out..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={
            !selectedUuid ||
            lineItems.length === 0 ||
            checkOutMutation.isPending
          }
          className="gap-2"
        >
          {checkOutMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUpFromLine className="h-4 w-4" />
          )}
          {checkOutMutation.isPending ? "Processing..." : "Check Out"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/warehouse")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
