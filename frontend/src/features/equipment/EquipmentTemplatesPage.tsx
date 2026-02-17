import { useState } from "react";
import { Plus, Search, Trash2, Edit, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useEquipmentTemplates,
  useEquipmentTemplate,
  useCreateEquipmentTemplate,
  useUpdateEquipmentTemplate,
  useDeleteEquipmentTemplate,
} from "@/hooks/use-templates";
import { useEquipmentModels } from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import type { EquipmentTemplate, EquipmentTemplateFormData } from "@/types/equipment-template";

export default function EquipmentTemplatesPage() {
  const [search, setSearch] = useState("");
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const perms = usePermission();

  const params: Record<string, string> = {};
  if (search) params.search = search;
  const templates = useEquipmentTemplates(params);
  const deleteMutation = useDeleteEquipmentTemplate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Equipment Templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable equipment lists for quick schedule setup.
          </p>
        </div>
        {perms.canManageEquipment && (
          <TemplateFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            trigger={
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Template
              </Button>
            }
          />
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {templates.isLoading ? (
        <TableSkeleton />
      ) : !templates.data?.results.length ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No templates found. Create one to get started.
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created</TableHead>
                {perms.canManageEquipment && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.data.results.map((tpl) => (
                <TemplateRow
                  key={tpl.uuid}
                  template={tpl}
                  canManage={perms.canManageEquipment}
                  onEdit={() => setEditingUuid(tpl.uuid)}
                  onDelete={() => {
                    if (confirm(`Delete template "${tpl.name}"?`)) {
                      deleteMutation.mutate(tpl.uuid);
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editingUuid && (
        <TemplateFormDialog
          uuid={editingUuid}
          open={!!editingUuid}
          onOpenChange={(open) => { if (!open) setEditingUuid(null); }}
        />
      )}
    </div>
  );
}

function TemplateRow({
  template,
  canManage,
  onEdit,
  onDelete,
}: {
  template: EquipmentTemplate;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium text-sm">{template.name}</span>
        {template.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {template.description}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{template.item_count}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {template.created_by_name ?? "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(template.created_at).toLocaleDateString()}
      </TableCell>
      {canManage && (
        <TableCell>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

// ─── Template Form Dialog ───────────────────────────────────────────

function TemplateFormDialog({
  uuid,
  open,
  onOpenChange,
  trigger,
}: {
  uuid?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!uuid;
  const detail = useEquipmentTemplate(uuid ?? "");
  const createMutation = useCreateEquipmentTemplate();
  const updateMutation = useUpdateEquipmentTemplate(uuid ?? "");
  const models = useEquipmentModels();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Array<{ equipment_model: number; quantity: number; model_name?: string }>>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Initialize form when edit data loads
  if (isEdit && detail.data && !initialized) {
    setName(detail.data.name);
    setDescription(detail.data.description);
    setItems(
      detail.data.items.map((item) => ({
        equipment_model: item.equipment_model,
        quantity: item.quantity,
        model_name: `${item.model_brand ? item.model_brand + " " : ""}${item.model_name}`,
      })),
    );
    setInitialized(true);
  }

  const filteredModels = (models.data?.results ?? []).filter((m) => {
    if (!modelSearch) return true;
    const q = modelSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) || (m.brand ?? "").toLowerCase().includes(q);
  });

  const addModel = (modelId: number, modelName: string) => {
    if (items.some((i) => i.equipment_model === modelId)) return;
    setItems([...items, { equipment_model: modelId, quantity: 1, model_name: modelName }]);
    setModelSearch("");
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, qty: number) => {
    setItems(items.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, qty) } : item)));
  };

  const handleSubmit = () => {
    const payload: EquipmentTemplateFormData = {
      name,
      description,
      items: items.map(({ equipment_model, quantity }) => ({ equipment_model, quantity })),
    };

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => {
        onOpenChange(false);
        setName("");
        setDescription("");
        setItems([]);
        setInitialized(false);
      },
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        setName("");
        setDescription("");
        setItems([]);
        setInitialized(false);
      }
      onOpenChange(v);
    }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Concert Rig" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="h-16" />
          </div>

          {/* Equipment items */}
          <div className="space-y-2">
            <Label>Equipment Items ({items.length})</Label>
            {items.length > 0 && (
              <div className="rounded-md border border-border divide-y divide-border">
                {items.map((item, index) => (
                  <div key={item.equipment_model} className="flex items-center gap-2 p-2">
                    <span className="flex-1 text-sm truncate">{item.model_name ?? `Model #${item.equipment_model}`}</span>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                      className="w-16 h-8 text-center"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(index)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Model search to add */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search equipment models to add..."
                className="pl-8"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
              />
            </div>
            {modelSearch && filteredModels.length > 0 && (
              <div className="rounded-md border border-border max-h-40 overflow-y-auto divide-y divide-border">
                {filteredModels.slice(0, 10).map((m) => (
                  <button
                    key={m.uuid}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                    disabled={items.some((i) => i.equipment_model === m.id)}
                    onClick={() => addModel(m.id, `${m.brand ? m.brand + " " : ""}${m.name}`)}
                  >
                    {m.brand && <span className="text-muted-foreground">{m.brand} </span>}
                    {m.name}
                    {items.some((i) => i.equipment_model === m.id) && (
                      <span className="text-xs text-muted-foreground ml-2">(added)</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!name || items.length === 0 || isPending}>
              {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
