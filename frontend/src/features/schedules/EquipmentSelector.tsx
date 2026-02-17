import { useState } from "react";
import { Search, Plus, Package, AlertTriangle, Clock, FileStack, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEquipmentModels, useRecentSelections } from "@/hooks/use-equipment";
import {
  useAddScheduleEquipment,
  useModelAvailability,
  useSchedules,
  useScheduleEquipment,
} from "@/hooks/use-schedules";
import { useEquipmentTemplates, useEquipmentTemplate } from "@/hooks/use-templates";
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

// ─── Shared ModelList ───────────────────────────────────────────────

function ModelList({
  models,
  isLoading,
  startDatetime,
  endDatetime,
  quantities,
  onQuantityChange,
  onAdd,
  addEquipment,
  existingModelUuids,
}: {
  models: EquipmentModel[] | undefined;
  isLoading: boolean;
  startDatetime: string;
  endDatetime: string;
  quantities: Record<string, number>;
  onQuantityChange: (uuid: string, qty: number) => void;
  onAdd: (model: EquipmentModel) => void;
  addEquipment: ReturnType<typeof useAddScheduleEquipment>;
  existingModelUuids: string[];
}) {
  return (
    <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
      {isLoading ? (
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
      ) : !models?.length ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No equipment models found
          </p>
        </div>
      ) : (
        models.map((model) => (
          <EquipmentModelRow
            key={model.uuid}
            model={model}
            startDatetime={startDatetime}
            endDatetime={endDatetime}
            quantity={quantities[model.uuid] ?? 1}
            onQuantityChange={(qty) => onQuantityChange(model.uuid, qty)}
            onAdd={() => onAdd(model)}
            isAdding={
              addEquipment.isPending &&
              addEquipment.variables?.equipment_model_uuid === model.uuid
            }
            isAlreadyAdded={existingModelUuids.includes(model.uuid)}
          />
        ))
      )}
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
  const [mode, setMode] = useState<"search" | "template" | "copy" | "recent">("search");
  const [searchTerm, setSearchTerm] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const searchParams: Record<string, string> = {};
  if (searchTerm) searchParams.search = searchTerm;

  const models = useEquipmentModels(open && mode === "search" ? searchParams : undefined);
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

        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="search" className="flex-1">
              <Search className="h-3.5 w-3.5 mr-1" />
              Search
            </TabsTrigger>
            <TabsTrigger value="copy" className="flex-1">
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy
            </TabsTrigger>
            <TabsTrigger value="template" className="flex-1">
              <FileStack className="h-3.5 w-3.5 mr-1" />
              Template
            </TabsTrigger>
            <TabsTrigger value="recent" className="flex-1">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Recent
            </TabsTrigger>
          </TabsList>

          {/* Search mode */}
          <TabsContent value="search" className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search equipment models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <ModelList
              models={models.data?.results}
              isLoading={models.isLoading}
              startDatetime={startDatetime}
              endDatetime={endDatetime}
              quantities={quantities}
              onQuantityChange={handleQuantityChange}
              onAdd={handleAdd}
              addEquipment={addEquipment}
              existingModelUuids={existingModelUuids}
            />
          </TabsContent>

          {/* Copy from Event mode */}
          <TabsContent value="copy">
            <CopyFromEventTab
              scheduleUuid={scheduleUuid}
              existingModelUuids={existingModelUuids}
            />
          </TabsContent>

          {/* Template mode */}
          <TabsContent value="template">
            <TemplateMode
              scheduleUuid={scheduleUuid}
              existingModelUuids={existingModelUuids}
            />
          </TabsContent>

          {/* Recent mode */}
          <TabsContent value="recent">
            <RecentTab
              startDatetime={startDatetime}
              endDatetime={endDatetime}
              quantities={quantities}
              onQuantityChange={handleQuantityChange}
              onAdd={handleAdd}
              addEquipment={addEquipment}
              existingModelUuids={existingModelUuids}
            />
          </TabsContent>
        </Tabs>

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

// ─── Template Mode ──────────────────────────────────────────────────

function TemplateMode({
  scheduleUuid,
  existingModelUuids,
}: {
  scheduleUuid: string;
  existingModelUuids: string[];
}) {
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const templates = useEquipmentTemplates();
  const detail = useEquipmentTemplate(selectedUuid ?? "");
  const addEquipment = useAddScheduleEquipment(scheduleUuid);
  const [addedModels, setAddedModels] = useState<Set<string>>(new Set());

  const handleAddAll = async () => {
    if (!detail.data) return;
    for (const item of detail.data.items) {
      if (existingModelUuids.includes(item.model_uuid) || addedModels.has(item.model_uuid)) continue;
      try {
        await addEquipment.mutateAsync({
          equipment_model_uuid: item.model_uuid,
          quantity_planned: item.quantity,
        });
        setAddedModels((prev) => new Set(prev).add(item.model_uuid));
      } catch {
        toast.error(`Failed to add ${item.model_name}`);
        return;
      }
    }
    toast.success("Template items added");
  };

  // Template list view
  if (!selectedUuid) {
    return (
      <div className="max-h-[400px] space-y-2 overflow-y-auto">
        {templates.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !templates.data?.results.length ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FileStack className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No templates available</p>
          </div>
        ) : (
          templates.data.results.map((tpl) => (
            <button
              key={tpl.uuid}
              type="button"
              className="w-full text-left rounded-md border border-border px-3 py-2.5 hover:bg-muted transition-colors"
              onClick={() => setSelectedUuid(tpl.uuid)}
            >
              <p className="text-sm font-medium">{tpl.name}</p>
              <p className="text-xs text-muted-foreground">
                {tpl.item_count} item{tpl.item_count !== 1 ? "s" : ""}
                {tpl.description && ` · ${tpl.description}`}
              </p>
            </button>
          ))
        )}
      </div>
    );
  }

  // Template detail view
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setSelectedUuid(null); setAddedModels(new Set()); }}
        >
          Back to templates
        </Button>
        <Button size="sm" onClick={handleAddAll} disabled={addEquipment.isPending}>
          {addEquipment.isPending ? "Adding..." : "Add All Items"}
        </Button>
      </div>
      <div className="max-h-[350px] space-y-2 overflow-y-auto">
        {detail.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          detail.data?.items.map((item) => {
            const isAdded = existingModelUuids.includes(item.model_uuid) || addedModels.has(item.model_uuid);
            return (
              <div key={item.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.model_name}
                    {item.model_brand && <span className="text-muted-foreground ml-1">({item.model_brand})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.category_name}</p>
                </div>
                <Badge variant="secondary">&times;{item.quantity}</Badge>
                {isAdded && <span className="text-xs text-muted-foreground">Added</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Copy from Event Tab ────────────────────────────────────────────

function CopyFromEventTab({
  scheduleUuid,
  existingModelUuids,
}: {
  scheduleUuid: string;
  existingModelUuids: string[];
}) {
  const [selectedSourceUuid, setSelectedSourceUuid] = useState<string | null>(null);
  const schedules = useSchedules();
  const sourceEquipment = useScheduleEquipment(selectedSourceUuid ?? "");
  const addEquipment = useAddScheduleEquipment(scheduleUuid);
  const [addedModels, setAddedModels] = useState<Set<string>>(new Set());

  const handleCopyAll = async () => {
    if (!sourceEquipment.data) return;
    for (const alloc of sourceEquipment.data) {
      const modelUuid = alloc.equipment_model.uuid;
      if (existingModelUuids.includes(modelUuid) || addedModels.has(modelUuid)) continue;
      try {
        await addEquipment.mutateAsync({
          equipment_model_uuid: modelUuid,
          quantity_planned: alloc.quantity_planned,
        });
        setAddedModels((prev) => new Set(prev).add(modelUuid));
      } catch {
        toast.error(`Failed to add ${alloc.equipment_model.name}`);
        return;
      }
    }
    toast.success("Equipment copied from event");
  };

  // Schedule picker
  if (!selectedSourceUuid) {
    return (
      <div className="max-h-[400px] space-y-2 overflow-y-auto">
        {schedules.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !schedules.data?.results.length ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No schedules found</p>
          </div>
        ) : (
          schedules.data.results
            .filter((s) => s.uuid !== scheduleUuid)
            .map((s) => (
              <button
                key={s.uuid}
                type="button"
                className="w-full text-left rounded-md border border-border px-3 py-2.5 hover:bg-muted transition-colors"
                onClick={() => setSelectedSourceUuid(s.uuid)}
              >
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {s.equipment_count} item{s.equipment_count !== 1 ? "s" : ""}
                  {" · "}
                  {new Date(s.start_datetime).toLocaleDateString()}
                </p>
              </button>
            ))
        )}
      </div>
    );
  }

  // Source equipment list
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setSelectedSourceUuid(null); setAddedModels(new Set()); }}
        >
          Back to schedules
        </Button>
        <Button size="sm" onClick={handleCopyAll} disabled={addEquipment.isPending}>
          {addEquipment.isPending ? "Copying..." : "Copy All Items"}
        </Button>
      </div>
      <div className="max-h-[350px] space-y-2 overflow-y-auto">
        {sourceEquipment.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          sourceEquipment.data?.map((alloc) => {
            const modelUuid = alloc.equipment_model.uuid;
            const isAdded = existingModelUuids.includes(modelUuid) || addedModels.has(modelUuid);
            return (
              <div key={alloc.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {alloc.equipment_model.name}
                    {alloc.equipment_model.brand && (
                      <span className="text-muted-foreground ml-1">({alloc.equipment_model.brand})</span>
                    )}
                  </p>
                </div>
                <Badge variant="secondary">&times;{alloc.quantity_planned}</Badge>
                {isAdded && <span className="text-xs text-muted-foreground">Added</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Recent Tab ─────────────────────────────────────────────────────

function RecentTab({
  startDatetime,
  endDatetime,
  quantities,
  onQuantityChange,
  onAdd,
  addEquipment,
  existingModelUuids,
}: {
  startDatetime: string;
  endDatetime: string;
  quantities: Record<string, number>;
  onQuantityChange: (uuid: string, qty: number) => void;
  onAdd: (model: EquipmentModel) => void;
  addEquipment: ReturnType<typeof useAddScheduleEquipment>;
  existingModelUuids: string[];
}) {
  const recent = useRecentSelections();
  return (
    <ModelList
      models={recent.data}
      isLoading={recent.isLoading}
      startDatetime={startDatetime}
      endDatetime={endDatetime}
      quantities={quantities}
      onQuantityChange={onQuantityChange}
      onAdd={onAdd}
      addEquipment={addEquipment}
      existingModelUuids={existingModelUuids}
    />
  );
}

export default EquipmentSelector;
