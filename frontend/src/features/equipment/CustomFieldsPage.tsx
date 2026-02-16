import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Settings2,
  GripVertical,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
  useCategoryTree,
} from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { getQueryLoadState } from "@/lib/query-load-state";
import {
  getTabIntentProps,
  useTabIntentPrefetch,
} from "@/lib/tab-intent-prefetch";
import type {
  CustomFieldDefinition,
  CustomFieldFormData,
  FieldType,
  EntityType,
  EquipmentCategoryTree,
  PaginatedResponse,
} from "@/types/equipment";

// ─── Constants ───────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "multiselect", label: "Multi-Select" },
];

const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "equipment_model", label: "Equipment Model" },
  { value: "equipment_item", label: "Equipment Item" },
];
const ENTITY_TABS = [
  { value: "all", label: "All" },
  { value: "equipment_model", label: "Equipment Model" },
  { value: "equipment_item", label: "Equipment Item" },
] as const;
type EntityTabValue = (typeof ENTITY_TABS)[number]["value"];

const FIELD_TYPE_VARIANT: Record<FieldType, "default" | "secondary" | "info" | "warning" | "outline" | "success"> = {
  text: "secondary",
  number: "info",
  boolean: "warning",
  date: "outline",
  select: "success",
  multiselect: "default",
};

// ─── Helpers ─────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "_")
    .replace(/-+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function flattenCategoryTree(
  nodes: EquipmentCategoryTree[] | undefined,
  depth = 0,
): Array<{ id: number; uuid: string; name: string; depth: number }> {
  if (!nodes) return [];
  const result: Array<{ id: number; uuid: string; name: string; depth: number }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, uuid: node.uuid, name: node.name, depth });
    result.push(...flattenCategoryTree(node.children, depth + 1));
  }
  return result;
}

// ─── Initial form state ──────────────────────────────────────────────

const EMPTY_FORM: CustomFieldFormData = {
  name: "",
  slug: "",
  field_type: "text",
  entity_type: "equipment_model",
  category: null,
  is_required: false,
  description: "",
  placeholder: "",
  options: null,
  display_order: 0,
  is_filterable: false,
  is_visible_in_list: false,
};

// ─── Page Component ──────────────────────────────────────────────────

export default function CustomFieldsPage() {
  const queryClient = useQueryClient();
  const [entityTab, setEntityTab] = useState<EntityTabValue>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null);

  const perms = usePermission();

  const buildParams = useCallback((tab: EntityTabValue) => {
    if (tab === "all") return undefined;
    return { entity_type: tab } as Record<string, string>;
  }, []);

  // Build query params based on active tab
  const queryParams = buildParams(entityTab);
  const customFields = useCustomFields(queryParams);
  const { isInitialLoading, isRefreshing } = getQueryLoadState(customFields);
  const { data } = customFields;
  const categoryTree = useCategoryTree();
  const flatCategories = flattenCategoryTree(categoryTree.data);

  const triggerPrefetch = useTabIntentPrefetch<EntityTabValue>((tab) => {
    const prefetchParams = buildParams(tab);
    return queryClient.prefetchQuery({
      queryKey: ["custom-fields", prefetchParams],
      queryFn: async () => {
        const { data } = await api.get<PaginatedResponse<CustomFieldDefinition>>(
          "/custom-fields/definitions/",
          { params: prefetchParams },
        );
        return data;
      },
    });
  });

  const createMutation = useCreateCustomField();
  const updateMutation = useUpdateCustomField(editingField?.id ?? 0);
  const deleteMutation = useDeleteCustomField(deleteTarget?.id ?? 0);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleOpenNew = () => {
    setEditingField(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(undefined, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Custom Fields
          </h1>
          <p className="text-sm text-muted-foreground">
            Define custom fields for equipment models and items
          </p>
        </div>
        {perms.canManageEquipment && (
          <Button size="sm" onClick={handleOpenNew}>
            <Plus className="h-4 w-4" />
            New Field
          </Button>
        )}
      </div>

      {/* Entity type filter tabs */}
      <Tabs value={entityTab} onValueChange={(v) => setEntityTab(v as EntityTabValue)}>
        <TabsList>
          {ENTITY_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              {...getTabIntentProps(tab.value, triggerPrefetch)}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={entityTab}>
          <QueryRefreshIndicator show={isRefreshing} />
          {isInitialLoading ? (
            <TableSkeleton />
          ) : !data?.results.length ? (
            <EmptyState />
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-center">Flags</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((field) => (
                    <TableRow key={field.id}>
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        <GripVertical className="inline h-3.5 w-3.5 opacity-40" />
                        {field.display_order}
                      </TableCell>
                      <TableCell className="font-medium">{field.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {field.slug}
                      </TableCell>
                      <TableCell>
                        <Badge variant={FIELD_TYPE_VARIANT[field.field_type]}>
                          {field.field_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {field.entity_type === "equipment_model" ? "Model" : "Item"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {field.is_required && (
                            <Badge variant="destructive" className="text-[10px] px-1.5">
                              required
                            </Badge>
                          )}
                          {field.is_filterable && (
                            <Badge variant="info" className="text-[10px] px-1.5">
                              filterable
                            </Badge>
                          )}
                          {field.is_visible_in_list && (
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              list
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {perms.canManageEquipment && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleOpenEdit(field)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(field)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Dialog */}
      <FieldFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingField={editingField}
        flatCategories={flatCategories}
        createMutation={createMutation}
        updateMutation={updateMutation}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Custom Field</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
              This will remove all stored values for this field. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Field Form Dialog ───────────────────────────────────────────────

function FieldFormDialog({
  open,
  onOpenChange,
  editingField,
  flatCategories,
  createMutation,
  updateMutation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingField: CustomFieldDefinition | null;
  flatCategories: Array<{ id: number; uuid: string; name: string; depth: number }>;
  createMutation: ReturnType<typeof useCreateCustomField>;
  updateMutation: ReturnType<typeof useUpdateCustomField>;
}) {
  const [form, setForm] = useState<CustomFieldFormData>(EMPTY_FORM);
  const [slugManual, setSlugManual] = useState(false);
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);

  const isEdit = !!editingField;
  const isSelectType = form.field_type === "select" || form.field_type === "multiselect";
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingField) {
        setForm({
          name: editingField.name,
          slug: editingField.slug,
          field_type: editingField.field_type,
          entity_type: editingField.entity_type,
          category: editingField.category,
          is_required: editingField.is_required,
          description: editingField.description,
          placeholder: editingField.placeholder,
          display_order: editingField.display_order,
          is_filterable: editingField.is_filterable,
          is_visible_in_list: editingField.is_visible_in_list,
          options: editingField.options,
        });
        setOptions(editingField.options ?? []);
        setSlugManual(true);
      } else {
        setForm(EMPTY_FORM);
        setOptions([]);
        setSlugManual(false);
      }
    }
  }, [open, editingField]);

  // Auto-generate slug from name
  const handleNameChange = useCallback(
    (name: string) => {
      setForm((prev) => ({
        ...prev,
        name,
        ...(!slugManual ? { slug: slugify(name) } : {}),
      }));
    },
    [slugManual],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: CustomFieldFormData = {
      ...form,
      options: isSelectType ? options : null,
    };

    if (isEdit) {
      updateMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  // ── Options editor helpers ────────────────────────────────────────

  const addOption = () => {
    setOptions((prev) => [...prev, { value: "", label: "" }]);
  };

  const updateOption = (index: number, key: "value" | "label", val: string) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, [key]: val } : opt)),
    );
  };

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Custom Field" : "New Custom Field"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the custom field definition below."
              : "Define a new custom field for equipment models or items."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row: Name + Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-name">Name</Label>
              <Input
                id="cf-name"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Weight"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-slug">
                Slug
                {!slugManual && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(auto)</span>
                )}
              </Label>
              <Input
                id="cf-slug"
                value={form.slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setForm((prev) => ({ ...prev, slug: e.target.value }));
                }}
                placeholder="weight"
                required
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Row: Field Type + Entity Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <Select
                value={form.field_type}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, field_type: v as FieldType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Entity Type</Label>
              <Select
                value={form.entity_type}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, entity_type: v as EntityType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category (optional) */}
          <div className="space-y-1.5">
            <Label>Category (optional)</Label>
            <Select
              value={form.category != null ? String(form.category) : "none"}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  category: v === "none" ? null : Number(v),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All categories</SelectItem>
                {flatCategories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {"\u00A0\u00A0".repeat(c.depth) + c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row: Description + Placeholder */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-description">Description</Label>
              <Input
                id="cf-description"
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Brief description of this field"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-placeholder">Placeholder</Label>
              <Input
                id="cf-placeholder"
                value={form.placeholder ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, placeholder: e.target.value }))
                }
                placeholder="Placeholder text"
              />
            </div>
          </div>

          {/* Display Order */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-order">Display Order</Label>
            <Input
              id="cf-order"
              type="number"
              value={form.display_order ?? 0}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  display_order: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-24 font-mono"
            />
          </div>

          {/* Checkboxes row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card/50 p-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_required ?? false}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, is_required: e.target.checked }))
                }
                className="h-4 w-4 rounded border-border bg-input accent-primary"
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_filterable ?? false}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, is_filterable: e.target.checked }))
                }
                className="h-4 w-4 rounded border-border bg-input accent-primary"
              />
              Filterable
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_visible_in_list ?? false}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    is_visible_in_list: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-border bg-input accent-primary"
              />
              Visible in List
            </label>
          </div>

          {/* Options editor (for select / multiselect) */}
          {isSelectType && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Option
                </Button>
              </div>

              {options.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No options defined. Add at least one option for select fields.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 text-xs text-muted-foreground px-1">
                    <span>Value</span>
                    <span>Label</span>
                    <span />
                  </div>
                  {options.map((opt, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center"
                    >
                      <Input
                        value={opt.value}
                        onChange={(e) => updateOption(i, "value", e.target.value)}
                        placeholder="value"
                        className="h-8 text-sm font-mono"
                      />
                      <Input
                        value={opt.label}
                        onChange={(e) => updateOption(i, "label", e.target.value)}
                        placeholder="Display label"
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeOption(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save Changes"
                  : "Create Field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
      <Settings2 className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">
        No custom fields defined yet
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 7 }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: 7 }).map((_, c) => (
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
