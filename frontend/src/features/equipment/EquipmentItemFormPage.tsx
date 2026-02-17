import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AxiosError } from "axios";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
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
  useEquipmentItem,
  useEquipmentModels,
  useCreateEquipmentItemsBatch,
  useUpdateEquipmentItem,
  useCustomFields,
} from "@/hooks/use-equipment";
import type { CustomFieldDefinition } from "@/types/equipment";

function padThreeId(value: number): string {
  return String(value).padStart(3, "0");
}

function getApiErrorMessage(error: unknown): string {
  const fallback = "An error occurred. Please try again.";
  const axiosErr = error as AxiosError<
    | { detail?: string }
    | Record<string, string[] | string>
  >;
  const data = axiosErr?.response?.data;

  if (!data) return (axiosErr?.message as string) || fallback;
  if (typeof data === "object" && "detail" in data && typeof data.detail === "string") {
    return data.detail;
  }

  if (typeof data === "object") {
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > 0) return String(value[0]);
      if (typeof value === "string" && value.length > 0) return value;
    }
  }

  return (axiosErr?.message as string) || fallback;
}

// ─── Zod schema ─────────────────────────────────────────────────────

const equipmentItemSchema = z.object({
  equipment_model: z.string().min(1, "Equipment model is required"),
  serial_number: z.string().max(200).optional().default(""),
  internal_id: z
    .string()
    .min(1, "Internal ID is required")
    .regex(/^\d+$/, "Internal ID must be numeric"),
  quantity: z.coerce.number().int().min(1).max(500).optional().default(1),
  ownership_type: z.enum(["owned", "rented_in"]).default("owned"),
  lamp_hours: z.coerce.number().int().min(0).optional().default(0),
  purchase_date: z.string().optional().default(""),
  warranty_expiry: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  custom_fields: z.record(z.unknown()).optional().default({}),
});

type EquipmentItemFormValues = z.infer<typeof equipmentItemSchema>;

// ─── Component ──────────────────────────────────────────────────────

export default function EquipmentItemFormPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!uuid;
  const navigate = useNavigate();

  // For create mode, optionally pre-select model from ?model= query param
  const preselectedModelUuid = searchParams.get("model") ?? "";

  // Queries
  const item = useEquipmentItem(uuid ?? "");
  const modelsQuery = useEquipmentModels();
  const customFields = useCustomFields({ entity_type: "equipment_item" });

  // Mutations
  const createBatchMutation = useCreateEquipmentItemsBatch();
  const updateMutation = useUpdateEquipmentItem(uuid ?? "");

  // Build a lookup from uuid -> model id for pre-selection
  const modelUuidToId = useMemo(() => {
    const map = new Map<string, number>();
    if (modelsQuery.data?.results) {
      for (const m of modelsQuery.data.results) {
        map.set(m.uuid, m.id);
      }
    }
    return map;
  }, [modelsQuery.data]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentItemFormValues>({
    resolver: zodResolver(equipmentItemSchema),
    defaultValues: {
      equipment_model: "",
      serial_number: "",
      internal_id: "",
      quantity: 1,
      ownership_type: "owned",
      lamp_hours: 0,
      purchase_date: "",
      warranty_expiry: "",
      notes: "",
      custom_fields: {},
    },
  });

  const customFieldValues = watch("custom_fields");
  const watchedInternalId = watch("internal_id");
  const watchedQuantity = watch("quantity") ?? 1;
  const normalizedQuantity = Number.isFinite(watchedQuantity)
    ? Math.max(1, Math.floor(watchedQuantity))
    : 1;
  const hasValidStartId = /^\d+$/.test(watchedInternalId || "");
  const previewStart = hasValidStartId ? padThreeId(Number(watchedInternalId)) : "";
  const previewEnd = hasValidStartId
    ? padThreeId(Number(watchedInternalId) + normalizedQuantity - 1)
    : "";

  // Pre-select model from query param (create mode)
  useEffect(() => {
    if (!isEdit && preselectedModelUuid && modelUuidToId.size > 0) {
      const modelId = modelUuidToId.get(preselectedModelUuid);
      if (modelId) {
        setValue("equipment_model", String(modelId), { shouldValidate: true });
      }
    }
  }, [isEdit, preselectedModelUuid, modelUuidToId, setValue]);

  // Populate form for edit mode
  useEffect(() => {
    if (isEdit && item.data) {
      const it = item.data;
      const normalizedExistingInternalId = /^\d+$/.test(it.internal_id || "")
        ? String(Number(it.internal_id))
        : "";
      reset({
        equipment_model: String(it.equipment_model),
        serial_number: it.serial_number,
        internal_id: normalizedExistingInternalId,
        quantity: 1,
        ownership_type: it.ownership_type,
        lamp_hours: it.lamp_hours,
        purchase_date: it.purchase_date ?? "",
        warranty_expiry: it.warranty_expiry ?? "",
        notes: it.notes || "",
        custom_fields: (it.custom_fields as Record<string, unknown>) ?? {},
      });
    }
  }, [isEdit, item.data, reset]);

  // Submit handler
  const onSubmit = async (values: EquipmentItemFormValues) => {
    const normalizedStartId = String(Number(values.internal_id));
    const commonPayload = {
      equipment_model: Number(values.equipment_model),
      internal_id: padThreeId(Number(values.internal_id)),
      ownership_type: values.ownership_type,
      lamp_hours: values.lamp_hours,
      purchase_date: values.purchase_date || null,
      warranty_expiry: values.warranty_expiry || null,
      notes: values.notes || undefined,
      custom_fields: values.custom_fields,
    };

    if (isEdit) {
      const result = await updateMutation.mutateAsync({
        ...commonPayload,
        serial_number: item.data?.serial_number,
      });
      navigate(`/equipment/items/${result.uuid}`);
    } else {
      const result = await createBatchMutation.mutateAsync({
        ...commonPayload,
        internal_id: normalizedStartId,
        quantity: values.quantity,
      });
      if (result.count === 1 && result.items[0]) {
        navigate(`/equipment/items/${result.items[0].uuid}`);
      } else {
        navigate("/equipment");
      }
    }
  };

  const isPending = createBatchMutation.isPending || updateMutation.isPending;

  // Loading state for edit
  if (isEdit && item.isLoading) {
    return <FormSkeleton />;
  }

  // Not found state for edit
  if (isEdit && !item.isLoading && !item.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <p>Equipment item not found</p>
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
              to={`/equipment/items/${uuid}`}
              className="hover:text-foreground transition-colors"
            >
              {item.data?.serial_number}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">Edit</span>
          </>
        ) : (
          <span className="text-foreground">New Equipment Item</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={isEdit ? `/equipment/items/${uuid}` : "/equipment"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {isEdit ? "Edit Equipment Item" : "New Equipment Item"}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-md border border-border bg-card p-6 space-y-5">
          {/* Equipment Model */}
          <div className="space-y-1.5">
            <Label>
              Equipment Model <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("equipment_model")}
              onValueChange={(v) =>
                setValue("equipment_model", v, { shouldValidate: true })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an equipment model" />
              </SelectTrigger>
              <SelectContent>
                {modelsQuery.isLoading ? (
                  <SelectItem value="__loading" disabled>
                    Loading models...
                  </SelectItem>
                ) : !modelsQuery.data?.results.length ? (
                  <SelectItem value="__empty" disabled>
                    No models found
                  </SelectItem>
                ) : (
                  modelsQuery.data.results
                    .filter((m) => m.is_numbered)
                    .map((m) => (
                      <SelectItem key={m.uuid} value={String(m.id)}>
                        {m.brand && `${m.brand} `}
                        {m.name}
                        {m.model_number && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({m.model_number})
                          </span>
                        )}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
            {errors.equipment_model && (
              <p className="text-xs text-destructive">
                {errors.equipment_model.message}
              </p>
            )}
          </div>

          {/* Serial / ID */}
          {isEdit ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Serial Number</Label>
                <Input
                  value={item.data?.serial_number ?? ""}
                  readOnly
                  className="font-mono bg-muted/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="internal_id">
                  Internal ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="internal_id"
                  inputMode="numeric"
                  placeholder="e.g. 001"
                  className="font-mono"
                  {...register("internal_id", {
                    setValueAs: (v) => String(v ?? "").replace(/\D/g, ""),
                  })}
                />
                {errors.internal_id && (
                  <p className="text-xs text-destructive">
                    {errors.internal_id.message}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="internal_id">
                  Start Internal ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="internal_id"
                  inputMode="numeric"
                  placeholder="e.g. 001"
                  className="font-mono"
                  {...register("internal_id", {
                    setValueAs: (v) => String(v ?? "").replace(/\D/g, ""),
                  })}
                />
                {errors.internal_id && (
                  <p className="text-xs text-destructive">
                    {errors.internal_id.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">
                  Quantity <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  step={1}
                  className="w-40 font-mono"
                  {...register("quantity", { valueAsNumber: true })}
                />
                {errors.quantity && (
                  <p className="text-xs text-destructive">
                    {errors.quantity.message}
                  </p>
                )}
              </div>
              {hasValidStartId && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Serial numbers will be auto-generated:{" "}
                  <span className="font-mono text-foreground">
                    {previewStart}
                    {normalizedQuantity > 1 ? ` to ${previewEnd}` : ""}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Ownership Type */}
          <div className="space-y-1.5">
            <Label>Ownership Type</Label>
            <Select
              value={watch("ownership_type")}
              onValueChange={(v) =>
                setValue("ownership_type", v as "owned" | "rented_in", {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owned">Owned</SelectItem>
                <SelectItem value="rented_in">Rented In</SelectItem>
              </SelectContent>
            </Select>
            {errors.ownership_type && (
              <p className="text-xs text-destructive">
                {errors.ownership_type.message}
              </p>
            )}
          </div>

          {/* Lamp Hours */}
          <div className="space-y-1.5">
            <Label htmlFor="lamp_hours">Lamp Hours</Label>
            <Input
              id="lamp_hours"
              type="number"
              min={0}
              step={1}
              className="w-40 font-mono"
              {...register("lamp_hours")}
            />
            {errors.lamp_hours && (
              <p className="text-xs text-destructive">
                {errors.lamp_hours.message}
              </p>
            )}
          </div>

          {/* Purchase Date + Warranty Expiry */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="purchase_date">Purchase Date</Label>
              <Input
                id="purchase_date"
                type="date"
                className="w-48"
                {...register("purchase_date")}
              />
              {errors.purchase_date && (
                <p className="text-xs text-destructive">
                  {errors.purchase_date.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="warranty_expiry">Warranty Expiry</Label>
              <Input
                id="warranty_expiry"
                type="date"
                className="w-48"
                {...register("warranty_expiry")}
              />
              {errors.warranty_expiry && (
                <p className="text-xs text-destructive">
                  {errors.warranty_expiry.message}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this item..."
              rows={3}
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-xs text-destructive">{errors.notes.message}</p>
            )}
          </div>
        </div>

        {/* Custom Fields */}
        {customFields.data && customFields.data.results.length > 0 && (
          <div className="rounded-md border border-border bg-card p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Custom Fields</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Additional fields defined for equipment items
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
        {(createBatchMutation.isError || updateMutation.isError) && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">
              {getApiErrorMessage(createBatchMutation.error || updateMutation.error)}
            </p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" type="button" asChild>
            <Link to={isEdit ? `/equipment/items/${uuid}` : "/equipment"}>
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
                : normalizedQuantity > 1
                  ? "Create Items"
                  : "Create Item"}
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
        {[1, 2, 3, 4, 5, 6].map((i) => (
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
