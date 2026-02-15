import { useState } from "react";
import { Search, Plus, Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEquipmentModels } from "@/hooks/use-equipment";
import {
  useAddScheduleEquipment,
  useModelAvailability,
} from "@/hooks/use-schedules";
import { toast } from "sonner";
import type { EquipmentModel } from "@/types/equipment";

// ─── Props ──────────────────────────────────────────────────────────

interface EquipmentSelectorProps {
  scheduleUuid: string;
  startDatetime: string;
  endDatetime: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingModelUuids?: string[];
}

// ─── EquipmentModelRow ──────────────────────────────────────────────

function EquipmentModelRow({
  model,
  startDatetime,
  endDatetime,
  quantity,
  onQuantityChange,
  onAdd,
  isAdding,
  isAlreadyAdded,
}: {
  model: EquipmentModel;
  startDatetime: string;
  endDatetime: string;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onAdd: () => void;
  isAdding: boolean;
  isAlreadyAdded: boolean;
}) {
  const hasDates = !!startDatetime && !!endDatetime;
  const availability = useModelAvailability(
    model.uuid,
    startDatetime,
    endDatetime,
  );

  const availableCount = availability.data?.confirmed_available ?? null;
  const isShortage =
    availableCount !== null && quantity > availableCount;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
      {/* Model info */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {model.name}
            {model.brand && (
              <span className="ml-1 text-muted-foreground">
                ({model.brand})
              </span>
            )}
          </p>
        </div>
        <Badge variant="secondary">{model.category_name}</Badge>
        <Badge variant={model.is_numbered ? "outline" : "secondary"}>
          {model.is_numbered ? "Numbered" : "Bulk"}
        </Badge>
      </div>

      {/* Availability */}
      <div className="flex shrink-0 items-center gap-1 text-sm">
        {hasDates ? (
          availability.isLoading ? (
            <Skeleton className="h-4 w-16" />
          ) : availableCount !== null ? (
            <span
              className={
                isShortage
                  ? "font-mono text-destructive"
                  : "font-mono text-success"
              }
            >
              Avail: {availableCount}
            </span>
          ) : (
            <span className="text-muted-foreground">--</span>
          )
        ) : (
          <span className="text-xs text-muted-foreground">No dates</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {isAlreadyAdded ? (
          <span className="text-xs text-muted-foreground">Already added</span>
        ) : (
          <>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onQuantityChange(isNaN(val) || val < 1 ? 1 : val);
              }}
              className="h-8 w-16 text-center text-sm"
            />
            {isShortage && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            )}
            <Button
              size="sm"
              variant="default"
              onClick={onAdd}
              disabled={isAdding}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── EquipmentSelector ──────────────────────────────────────────────

export function EquipmentSelector({
  scheduleUuid,
  startDatetime,
  endDatetime,
  open,
  onOpenChange,
  existingModelUuids = [],
}: EquipmentSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const searchParams: Record<string, string> = {};
  if (searchTerm) searchParams.search = searchTerm;

  const models = useEquipmentModels(open ? searchParams : undefined);
  const addEquipment = useAddScheduleEquipment(scheduleUuid);

  const handleQuantityChange = (modelUuid: string, qty: number) => {
    setQuantities((prev) => ({ ...prev, [modelUuid]: qty }));
  };

  const handleAdd = async (model: EquipmentModel) => {
    const qty = quantities[model.uuid] ?? 1;

    try {
      await addEquipment.mutateAsync({
        equipment_model_uuid: model.uuid,
        quantity_planned: qty,
      });
      toast.success("Equipment added");
      // Reset quantity for this model after success
      setQuantities((prev) => {
        const next = { ...prev };
        delete next[model.uuid];
        return next;
      });
    } catch {
      toast.error("Failed to add equipment");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Equipment</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search equipment models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Results */}
        <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
          {models.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
                >
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="flex-1" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : models.data?.results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No equipment models found
              </p>
            </div>
          ) : (
            models.data?.results.map((model) => (
              <EquipmentModelRow
                key={model.uuid}
                model={model}
                startDatetime={startDatetime}
                endDatetime={endDatetime}
                quantity={quantities[model.uuid] ?? 1}
                onQuantityChange={(qty) =>
                  handleQuantityChange(model.uuid, qty)
                }
                onAdd={() => handleAdd(model)}
                isAdding={
                  addEquipment.isPending &&
                  addEquipment.variables?.equipment_model_uuid === model.uuid
                }
                isAlreadyAdded={existingModelUuids.includes(model.uuid)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EquipmentSelector;
