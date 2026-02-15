import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Save } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useEquipmentModel,
  useCreateEquipmentModel,
  useUpdateEquipmentModel,
  useCategoryTree,
  useCustomFields,
} from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import type { EquipmentCategoryTree, CustomFieldDefinition } from "@/types/equipment";

// ─── Zod schema ─────────────────────────────────────────────────────

const equipmentModelSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200),
    brand: z.string().max(200).optional().default(""),
    model_number: z.string().max(200).optional().default(""),
    description: z.string().optional().default(""),
    category: z.string().min(1, "Category is required"),
    is_numbered: z.boolean().default(true),
    total_quantity: z.coerce.number().int().min(0).optional().default(0),
    custom_fields: z.record(z.unknown()).optional().default({}),
  })
  .refine(
    (data) => data.is_numbered || data.total_quantity > 0,
    {
      message: "Total quantity is required for unnumbered (bulk) equipment",
      path: ["total_quantity"],
    },
  );

type EquipmentModelFormValues = z.infer<typeof equipmentModelSchema>;

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────

export default function EquipmentModelFormPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const isEdit = !!uuid;
  const navigate = useNavigate();
  const perms = usePermission();

  // Queries
  const model = useEquipmentModel(uuid ?? "");
  const categoryTree = useCategoryTree();
  const customFields = useCustomFields({ entity_type: "equipment_model" });

  // Mutations
  const createMutation = useCreateEquipmentModel();
  const updateMutation = useUpdateEquipmentModel(uuid ?? "");

  const flatCategories = useMemo(
    () => flattenCategoryTree(categoryTree.data),
    [categoryTree.data],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentModelFormValues>({
    resolver: zodResolver(equipmentModelSchema),
    defaultValues: {
      name: "",
      brand: "",
      model_number: "",
      description: "",
      category: "",
      is_numbered: true,
      total_quantity: 0,
      custom_fields: {},
    },
  });

  const isNumbered = watch("is_numbered");
  const customFieldValues = watch("custom_fields");

  // Populate form for edit mode
  useEffect(() => {
    if (isEdit && model.data) {
      const m = model.data;
      reset({
        name: m.name,
        brand: m.brand || "",
        model_number: m.model_number || "",
        description: m.description || "",
        category: String(m.category),
        is_numbered: m.is_numbered,
        total_quantity: m.total_quantity,
        custom_fields: (m.custom_fields as Record<string, unknown>) ?? {},
      });
    }
  }, [isEdit, model.data, reset]);

  // Submit handler
  const onSubmit = async (values: EquipmentModelFormValues) => {
    const payload = {
      name: values.name,
      brand: values.brand || undefined,
      model_number: values.model_number || undefined,
      description: values.description || undefined,
      category: Number(values.category),
      is_numbered: values.is_numbered,
      total_quantity: values.is_numbered ? undefined : values.total_quantity,
      custom_fields: values.custom_fields,
    };

    if (isEdit) {
      const result = await updateMutation.mutateAsync(payload);
      navigate(`/equipment/models/${result.uuid}`);
    } else {
      const result = await createMutation.mutateAsync(payload);
      navigate(`/equipment/models/${result.uuid}`);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Loading state for edit
  if (isEdit && model.isLoading) {
    return <FormSkeleton />;
  }

  // Not found state for edit
  if (isEdit && !model.isLoading && !model.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <p>Equipment model not found</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/equipment">Back to Equipment</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/equipment" className="hover:text-foreground transition-colors">
          Equipment
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {isEdit ? (
          <>
            <Link
              to={`/equipment/models/${uuid}`}
              className="hover:text-foreground transition-colors"
            >
              {model.data?.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">Edit</span>
          </>
        ) : (
          <span className="text-foreground">New Equipment Model</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={isEdit ? `/equipment/models/${uuid}` : "/equipment"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {isEdit ? "Edit Equipment Model" : "New Equipment Model"}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-md border border-border bg-card p-6 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Moving Head Wash"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Brand + Model Number (side by side) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                placeholder="e.g. Martin, Robe, Clay Paky"
                {...register("brand")}
              />
              {errors.brand && (
                <p className="text-xs text-destructive">{errors.brand.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model_number">Model Number</Label>
              <Input
                id="model_number"
                placeholder="e.g. MAC Aura XB"
                {...register("model_number")}
              />
              {errors.model_number && (
                <p className="text-xs text-destructive">
                  {errors.model_number.message}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description of this equipment model..."
              rows={3}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>
              Category <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("category")}
              onValueChange={(v) => setValue("category", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categoryTree.isLoading ? (
                  <SelectItem value="__loading" disabled>
                    Loading categories...
                  </SelectItem>
                ) : flatCategories.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    No categories found
                  </SelectItem>
                ) : (
                  flatCategories.map((c) => (
                    <SelectItem key={c.uuid} value={String(c.id)}>
                      {"\u00A0\u00A0".repeat(c.depth)}{c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-xs text-destructive">{errors.category.message}</p>
            )}
          </div>

          {/* Is Numbered toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <input
                id="is_numbered"
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-input text-primary accent-primary focus:ring-ring/40"
                {...register("is_numbered")}
              />
              <Label htmlFor="is_numbered" className="cursor-pointer">
                Numbered (individually tracked items)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              {isNumbered
                ? "Each item has a serial number and is tracked individually."
                : "Tracked by total quantity only (e.g. cables, gaffer tape)."}
            </p>
          </div>

          {/* Total Quantity (only for bulk / unnumbered) */}
          {!isNumbered && (
            <div className="space-y-1.5">
              <Label htmlFor="total_quantity">
                Total Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="total_quantity"
                type="number"
                min={0}
                step={1}
                className="w-40"
                {...register("total_quantity")}
              />
              {errors.total_quantity && (
                <p className="text-xs text-destructive">
                  {errors.total_quantity.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Custom Fields */}
        {customFields.data && customFields.data.results.length > 0 && (
          <div className="rounded-md border border-border bg-card p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Custom Fields</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Additional fields defined for equipment models
              </p>
            </div>
            {customFields.data.results.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={customFieldValues?.[field.slug]}
                onChange={(val) =>
                  setValue(`custom_fields.${field.slug}`, val, {
                    shouldValidate: true,
                  })
                }
              />
            ))}
          </div>
        )}

        {/* Error message */}
        {(createMutation.isError || updateMutation.isError) && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">
              {(createMutation.error || updateMutation.error)?.message ??
                "An error occurred. Please try again."}
            </p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" type="button" asChild>
            <Link to={isEdit ? `/equipment/models/${uuid}` : "/equipment"}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={isPending || isSubmitting}>
            <Save className="h-4 w-4" />
            {isPending
              ? isEdit
                ? "Saving..."
                : "Creating..."
              : isEdit
                ? "Save Changes"
                : "Create Model"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Custom Field Input ─────────────────────────────────────────────

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const fieldLabel = (
    <Label>
      {field.name}
      {field.is_required && <span className="text-destructive"> *</span>}
    </Label>
  );

  switch (field.field_type) {
    case "text":
      return (
        <div className="space-y-1.5">
          {fieldLabel}
          <Input
            placeholder={field.placeholder || undefined}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          {fieldLabel}
          <Input
            type="number"
            placeholder={field.placeholder || undefined}
            value={(value as string | number) ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className="w-40"
          />
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      );

    case "boolean":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border bg-input text-primary accent-primary focus:ring-ring/40"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
            />
            <Label className="cursor-pointer">{field.name}</Label>
          </div>
          {field.description && (
            <p className="text-xs text-muted-foreground ml-7">
              {field.description}
            </p>
          )}
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          {fieldLabel}
          <Input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-48"
          />
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          {fieldLabel}
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => onChange(v === "__none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">
                <span className="text-muted-foreground">None</span>
              </SelectItem>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      );

    case "multiselect":
      // Render as a set of checkboxes for multiselect
      return (
        <div className="space-y-1.5">
          {fieldLabel}
          <div className="flex flex-wrap gap-3">
            {field.options?.map((opt) => {
              const selected = Array.isArray(value) && value.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border bg-input text-primary accent-primary focus:ring-ring/40"
                    checked={selected}
                    onChange={(e) => {
                      const current = Array.isArray(value) ? [...value] : [];
                      if (e.target.checked) {
                        current.push(opt.value);
                      } else {
                        const idx = current.indexOf(opt.value);
                        if (idx >= 0) current.splice(idx, 1);
                      }
                      onChange(current);
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      );

    default:
      return null;
  }
}

// ─── Loading skeleton ───────────────────────────────────────────────

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-6 w-56" />
      </div>
      <div className="rounded-md border border-border bg-card p-6 space-y-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
