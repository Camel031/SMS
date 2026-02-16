import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  Loader2,
  Package,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSchedules,
  useScheduleCheckoutRecords,
} from "@/hooks/use-schedules";
import { useRentalAgreements } from "@/hooks/use-rentals";
import { useCheckIn } from "@/hooks/use-warehouse";
import type { TransactionLineItemCreate } from "@/types/warehouse";
import type { CheckoutRecordItem } from "@/types/schedule";

// ─── Types ─────────────────────────────────────────────────────────

type ContextType = "schedule" | "rental";

const CONDITION_OPTIONS = [
  { value: "", label: "Good" },
  { value: "damaged", label: "Damaged" },
  { value: "needs_repair", label: "Needs Repair" },
  { value: "missing_parts", label: "Missing Parts" },
];

// ─── Page Component ─────────────────────────────────────────────────

export default function CheckInPage() {
  const navigate = useNavigate();
  const [contextType, setContextType] = useState<ContextType>("schedule");
  const [selectedUuid, setSelectedUuid] = useState("");
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<number>>(
    new Set(),
  );
  const [conditions, setConditions] = useState<Record<number, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [notes, setNotes] = useState("");

  // Queries
  const schedules = useSchedules();
  const rentals = useRentalAgreements({ status: "active" });
  const checkoutRecords = useScheduleCheckoutRecords(
    contextType === "schedule" ? selectedUuid : "",
  );

  const checkInMutation = useCheckIn();

  function handleContextChange(uuid: string) {
    setSelectedUuid(uuid);
    setSelectedRecordIds(new Set());
    setConditions({});
    setItemNotes({});
  }

  function toggleRecord(record: CheckoutRecordItem) {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(record.id)) {
        next.delete(record.id);
      } else {
        next.add(record.id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (!checkoutRecords.data) return;
    if (selectedRecordIds.size === checkoutRecords.data.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(
        new Set(checkoutRecords.data.map((r) => r.id)),
      );
    }
  }

  async function handleSubmit() {
    if (selectedRecordIds.size === 0) {
      toast.error("Select at least one item to check in");
      return;
    }

    const records = checkoutRecords.data?.filter((r) =>
      selectedRecordIds.has(r.id),
    );
    if (!records) return;

    const items: TransactionLineItemCreate[] = records.map((record) => {
      // We need to find the equipment_model_uuid from the record
      // The record has equipment_model_name and equipment_item info
      const base: TransactionLineItemCreate = {
        equipment_model_uuid: "", // Will be filled from allocation context
        quantity: record.equipment_item ? 1 : record.quantity_still_out,
        condition_on_return: conditions[record.id] || "",
        notes: itemNotes[record.id] || "",
      };
      if (record.equipment_item) {
        base.equipment_item_uuid = record.equipment_item.uuid;
      }
      return base;
    });

    // For schedule context, we need to resolve model UUIDs from schedule equipment
    // The check-in API will resolve them on the backend

    const payload = {
      schedule_uuid:
        contextType === "schedule" ? selectedUuid : undefined,
      rental_agreement_uuid:
        contextType === "rental" ? selectedUuid : undefined,
      items,
      requires_confirmation: requiresConfirmation,
      notes,
    };

    try {
      const result = await checkInMutation.mutateAsync(payload);
      toast.success("Check-in created successfully");
      navigate(`/warehouse/transactions/${result.uuid}`);
    } catch {
      toast.error("Failed to create check-in");
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
          <ArrowDownToLine className="h-5 w-5" />
          Check In Equipment
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a schedule or rental agreement, then choose items to return
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
              setSelectedRecordIds(new Set());
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
                      {s.title} ({s.status})
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

      {/* Checked-out Items */}
      {selectedUuid && contextType === "schedule" && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Currently Checked Out
            </h2>

            {checkoutRecords.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !checkoutRecords.data?.length ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-12">
                <Package className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No items currently checked out for this schedule
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            checkoutRecords.data.length > 0 &&
                            selectedRecordIds.size ===
                              checkoutRecords.data.length
                          }
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Serial Number</TableHead>
                      <TableHead className="text-right">Qty Out</TableHead>
                      <TableHead>Checked Out By</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkoutRecords.data.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRecordIds.has(record.id)}
                            onCheckedChange={() => toggleRecord(record)}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {record.equipment_model_name}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {record.equipment_item?.serial_number ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {record.quantity_still_out}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.checked_out_by.full_name}
                        </TableCell>
                        <TableCell>
                          {selectedRecordIds.has(record.id) && (
                            <Select
                              value={conditions[record.id] ?? ""}
                              onValueChange={(v) =>
                                setConditions((prev) => ({
                                  ...prev,
                                  [record.id]: v,
                                }))
                              }
                            >
                              <SelectTrigger className="h-7 w-32 text-xs">
                                <SelectValue placeholder="Good" />
                              </SelectTrigger>
                              <SelectContent>
                                {CONDITION_OPTIONS.map((opt) => (
                                  <SelectItem
                                    key={opt.value || "good"}
                                    value={opt.value || "good"}
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {selectedRecordIds.has(record.id) && (
                            <Input
                              placeholder="Notes..."
                              value={itemNotes[record.id] ?? ""}
                              onChange={(e) =>
                                setItemNotes((prev) => ({
                                  ...prev,
                                  [record.id]: e.target.value,
                                }))
                              }
                              className="h-7 text-xs w-32"
                            />
                          )}
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

      {/* Options */}
      {selectedUuid && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="requires-confirmation-checkin"
                checked={requiresConfirmation}
                onCheckedChange={(v) =>
                  setRequiresConfirmation(v === true)
                }
              />
              <Label
                htmlFor="requires-confirmation-checkin"
                className="text-sm"
              >
                Requires dual-person confirmation
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes about this check-in..."
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
            selectedRecordIds.size === 0 ||
            checkInMutation.isPending
          }
          className="gap-2"
        >
          {checkInMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-4 w-4" />
          )}
          {checkInMutation.isPending ? "Processing..." : "Check In"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/warehouse")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
