import { useCallback, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEquipmentItems } from "@/hooks/use-equipment";
import { useUpdateScheduleEquipment } from "@/hooks/use-schedules";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EquipmentStatus } from "@/types/equipment";
import type { PlannedItemNested } from "@/types/schedule";

// ─── Status config ──────────────────────────────────────────────────

const STATUS_STYLE: Record<
  EquipmentStatus,
  { bg: string; label: string; selectable: boolean }
> = {
  available: { bg: "bg-emerald-500/20 border-emerald-500/40", label: "Available", selectable: true },
  reserved: { bg: "bg-blue-500/20 border-blue-500/40", label: "Reserved (scheduled)", selectable: false },
  out: { bg: "bg-amber-500/20 border-amber-500/40", label: "Checked out", selectable: false },
  pending_receipt: { bg: "bg-gray-400/20 border-gray-400/40", label: "Pending receipt", selectable: false },
  lost: { bg: "bg-red-500/20 border-red-500/40", label: "Lost", selectable: false },
  retired: { bg: "bg-gray-300/20 border-gray-300/40", label: "Retired", selectable: false },
  returned_to_vendor: { bg: "bg-gray-300/20 border-gray-300/40", label: "Returned to vendor", selectable: false },
};

// ─── Types ──────────────────────────────────────────────────────────

interface GridItem {
  uuid: string;
  internal_id: string;
  current_status: EquipmentStatus;
  isCurrentlyPlanned: boolean;
}

interface NumberedItemPickerProps {
  scheduleUuid: string;
  allocationId: number;
  modelUuid: string;
  quantityPlanned: number;
  currentPlannedItems: PlannedItemNested[];
}

// ─── Component ──────────────────────────────────────────────────────

export function NumberedItemPicker({
  scheduleUuid,
  allocationId,
  modelUuid,
  quantityPlanned,
  currentPlannedItems,
}: NumberedItemPickerProps) {
  const [search, setSearch] = useState("");
  const [rangeInput, setRangeInput] = useState("");
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(
    () => new Set(currentPlannedItems.map((i) => i.uuid)),
  );
  const lastClickedRef = useRef<number | null>(null);

  // Fetch ALL items for this model (not just available) to show full grid
  const params: Record<string, string> = { model_uuid: modelUuid };
  if (search) params.search = search;
  const items = useEquipmentItems(params);
  const updateMutation = useUpdateScheduleEquipment(scheduleUuid);

  const plannedUuidSet = new Set(currentPlannedItems.map((i) => i.uuid));

  // Build grid items
  const allItems: GridItem[] = (items.data?.results ?? []).map((i) => ({
    uuid: i.uuid,
    internal_id: i.internal_id,
    current_status: i.current_status,
    isCurrentlyPlanned: plannedUuidSet.has(i.uuid),
  }));

  const isSelectable = (item: GridItem) => {
    const cfg = STATUS_STYLE[item.current_status];
    return cfg.selectable || item.isCurrentlyPlanned || selectedUuids.has(item.uuid);
  };

  // ─── Toggle logic ───────────────────────────────────────────────

  const toggle = useCallback(
    (uuid: string) => {
      setSelectedUuids((prev) => {
        const next = new Set(prev);
        if (next.has(uuid)) {
          next.delete(uuid);
        } else if (next.size < quantityPlanned) {
          next.add(uuid);
        }
        return next;
      });
    },
    [quantityPlanned],
  );

  // ─── Shift+Click range select ───────────────────────────────────

  const handleClick = useCallback(
    (index: number, shiftKey: boolean) => {
      const item = allItems[index];
      if (!item || !isSelectable(item)) return;

      if (shiftKey && lastClickedRef.current !== null) {
        const start = Math.min(lastClickedRef.current, index);
        const end = Math.max(lastClickedRef.current, index);
        setSelectedUuids((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            const it = allItems[i];
            if (it && isSelectable(it) && next.size < quantityPlanned) {
              next.add(it.uuid);
            }
          }
          return next;
        });
      } else {
        toggle(item.uuid);
      }
      lastClickedRef.current = index;
    },
    [allItems, quantityPlanned, toggle],
  );

  // ─── Range input (#1 to #32) ────────────────────────────────────

  const applyRange = () => {
    const match = rangeInput.match(/^#?(\d+)\s*[-–to]+\s*#?(\d+)$/i);
    if (!match) {
      toast.error("Format: #1 to #32 or 1-32");
      return;
    }
    const from = parseInt(match[1], 10);
    const to = parseInt(match[2], 10);
    if (from > to) {
      toast.error("Start must be ≤ end");
      return;
    }

    setSelectedUuids((prev) => {
      const next = new Set(prev);
      // Match items whose internal_id contains a number in range
      for (const item of allItems) {
        if (!isSelectable(item)) continue;
        const num = parseInt(item.internal_id.replace(/\D/g, ""), 10);
        if (!isNaN(num) && num >= from && num <= to && next.size < quantityPlanned) {
          next.add(item.uuid);
        }
      }
      return next;
    });
    setRangeInput("");
  };

  // ─── Save ───────────────────────────────────────────────────────

  const handleSave = () => {
    updateMutation.mutate(
      {
        pk: allocationId,
        payload: { planned_item_uuids: Array.from(selectedUuids) },
      },
      {
        onSuccess: () => toast.success("Items assigned"),
        onError: () => toast.error("Failed to assign items"),
      },
    );
  };

  const hasChanges =
    selectedUuids.size !== currentPlannedItems.length ||
    !currentPlannedItems.every((i) => selectedUuids.has(i.uuid));

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border border-border rounded-md p-3 space-y-3 bg-muted/20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Assign items: <span className="font-mono font-semibold text-foreground">{selectedUuids.size}</span> / {quantityPlanned}
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Assignment"}
          </Button>
        </div>

        {/* Search + Range input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search internal IDs..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            <Input
              placeholder="#1 to #32"
              className="h-8 w-28 text-sm font-mono"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyRange()}
            />
            <Button variant="outline" size="sm" className="h-8" onClick={applyRange} disabled={!rangeInput}>
              Select
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border bg-emerald-500/20 border-emerald-500/40" /> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border bg-blue-500/20 border-blue-500/40" /> Scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border bg-amber-500/20 border-amber-500/40" /> Out
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border bg-primary/20 border-primary/40" /> Selected
          </span>
        </div>

        {/* Grid */}
        <div className="max-h-64 overflow-y-auto">
          {items.isLoading ? (
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </div>
          ) : allItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No items found for this model.
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
              {allItems.map((item, index) => {
                const isSelected = selectedUuids.has(item.uuid);
                const canSelect = isSelectable(item);
                const isAtLimit = selectedUuids.size >= quantityPlanned && !isSelected;
                const statusCfg = STATUS_STYLE[item.current_status];
                const disabled = (!canSelect || isAtLimit) && !isSelected;

                return (
                  <Tooltip key={item.uuid}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={(e) => handleClick(index, e.shiftKey)}
                        className={cn(
                          "relative h-9 rounded border text-[11px] font-mono transition-all select-none",
                          isSelected
                            ? "bg-primary/15 border-primary ring-1 ring-primary/30 text-primary font-semibold"
                            : canSelect
                              ? cn(statusCfg.bg, "hover:ring-1 hover:ring-primary/20 text-foreground cursor-pointer")
                              : cn(statusCfg.bg, "opacity-50 cursor-not-allowed text-muted-foreground"),
                        )}
                      >
                        {item.internal_id.length > 6
                          ? "…" + item.internal_id.slice(-5)
                          : item.internal_id}
                        {isSelected && (
                          <Check className="absolute top-0.5 right-0.5 h-3 w-3 text-primary" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-mono font-semibold">{item.internal_id}</p>
                      <p className="text-muted-foreground">
                        {statusCfg.label}
                        {item.isCurrentlyPlanned && " · Currently assigned"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
