import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquipmentItems } from "@/hooks/use-equipment";
import { useUpdateScheduleEquipment } from "@/hooks/use-schedules";
import { toast } from "sonner";
import type { PlannedItemNested } from "@/types/schedule";

interface NumberedItemPickerProps {
  scheduleUuid: string;
  allocationId: number;
  modelUuid: string;
  quantityPlanned: number;
  currentPlannedItems: PlannedItemNested[];
}

export function NumberedItemPicker({
  scheduleUuid,
  allocationId,
  modelUuid,
  quantityPlanned,
  currentPlannedItems,
}: NumberedItemPickerProps) {
  const [search, setSearch] = useState("");
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(
    () => new Set(currentPlannedItems.map((i) => i.uuid)),
  );

  const params: Record<string, string> = {
    model_uuid: modelUuid,
    status: "available",
  };
  if (search) params.search = search;
  const items = useEquipmentItems(params);
  const updateMutation = useUpdateScheduleEquipment(scheduleUuid);

  const toggle = (uuid: string) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else if (next.size < quantityPlanned) {
        next.add(uuid);
      }
      return next;
    });
  };

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

  // Combine currently planned items with available items (avoid duplicates)
  const availableItems = items.data?.results ?? [];
  const alreadyPlannedUuids = new Set(currentPlannedItems.map((i) => i.uuid));
  const allItems = [
    // Show currently planned items first (even if no longer available)
    ...currentPlannedItems.map((pi) => ({
      uuid: pi.uuid,
      serial_number: pi.serial_number,
      isCurrentlyPlanned: true,
    })),
    // Then show available items that aren't already in planned
    ...availableItems
      .filter((i) => !alreadyPlannedUuids.has(i.uuid))
      .map((i) => ({
        uuid: i.uuid,
        serial_number: i.serial_number,
        isCurrentlyPlanned: false,
      })),
  ];

  return (
    <div className="border border-border rounded-md p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Assign items: {selectedUuids.size} / {quantityPlanned}
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving..." : "Save Assignment"}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search serial numbers..."
          className="pl-8 h-8 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1">
        {items.isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : allItems.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No available items found for this model.
          </p>
        ) : (
          allItems.map((item) => {
            const isSelected = selectedUuids.has(item.uuid);
            const isAtLimit = selectedUuids.size >= quantityPlanned && !isSelected;
            return (
              <button
                key={item.uuid}
                type="button"
                disabled={isAtLimit}
                onClick={() => toggle(item.uuid)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  isSelected
                    ? "bg-primary/10 border border-primary/30"
                    : isAtLimit
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-muted border border-transparent"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <span className="font-mono text-xs">{item.serial_number}</span>
                {item.isCurrentlyPlanned && (
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    Assigned
                  </Badge>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
