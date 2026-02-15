import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  useRentalAgreement,
  useCreateRentalAgreement,
  useUpdateRentalAgreement,
} from "@/hooks/use-rentals";
import { toast } from "sonner";

// ─── Zod schema ─────────────────────────────────────────────────────

const rentalSchema = z
  .object({
    direction: z.enum(["in", "out"]),
    vendor_name: z.string().min(1, "Vendor name is required"),
    vendor_contact: z.string().optional(),
    vendor_phone: z.string().optional(),
    vendor_email: z.string().email().optional().or(z.literal("")),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return new Date(data.end_date) >= new Date(data.start_date);
      }
      return true;
    },
    { message: "End date must be on or after start date", path: ["end_date"] },
  );

type RentalFormValues = z.infer<typeof rentalSchema>;

// ─── Helpers ────────────────────────────────────────────────────────

const DIRECTION_LABELS: Record<string, string> = {
  in: "Rental In",
  out: "Rental Out",
};

// ─── Component ──────────────────────────────────────────────────────

export default function RentalFormPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const isEdit = !!uuid;
  const navigate = useNavigate();

  // Queries
  const agreement = useRentalAgreement(uuid ?? "");

  // Mutations
  const createMutation = useCreateRentalAgreement();
  const updateMutation = useUpdateRentalAgreement(uuid ?? "");

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RentalFormValues>({
    resolver: zodResolver(rentalSchema),
    defaultValues: {
      direction: "in",
      vendor_name: "",
      vendor_contact: "",
      vendor_phone: "",
      vendor_email: "",
      start_date: "",
      end_date: "",
      notes: "",
    },
  });

  // Populate form for edit mode
  useEffect(() => {
    if (isEdit && agreement.data) {
      const a = agreement.data;
      reset({
        direction: a.direction,
        vendor_name: a.vendor_name,
        vendor_contact: a.vendor_contact || "",
        vendor_phone: a.vendor_phone || "",
        vendor_email: a.vendor_email || "",
        start_date: a.start_date ? a.start_date.slice(0, 10) : "",
        end_date: a.end_date ? a.end_date.slice(0, 10) : "",
        notes: a.notes || "",
      });
    }
  }, [isEdit, agreement.data, reset]);

  // Submit handler
  const onSubmit = async (values: RentalFormValues) => {
    const payload = {
      direction: values.direction,
      vendor_name: values.vendor_name,
      vendor_contact: values.vendor_contact || undefined,
      vendor_phone: values.vendor_phone || undefined,
      vendor_email: values.vendor_email || undefined,
      start_date: values.start_date,
      end_date: values.end_date,
      notes: values.notes || undefined,
    };

    if (isEdit) {
      // Do not send direction on update
      const { direction: _, ...updatePayload } = payload;
      const result = await updateMutation.mutateAsync(updatePayload);
      toast.success("Agreement updated");
      navigate(`/rentals/${result.uuid}`);
    } else {
      const result = await createMutation.mutateAsync(payload);
      toast.success("Agreement created");
      navigate(`/rentals/${result.uuid}`);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Loading state for edit
  if (isEdit && agreement.isLoading) {
    return <FormSkeleton />;
  }

  // Not found state for edit
  if (isEdit && !agreement.isLoading && !agreement.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <p>Agreement not found</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/rentals">Back to Rental Agreements</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/rentals"
          className="hover:text-foreground transition-colors"
        >
          Rental Agreements
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {isEdit ? (
          <span className="text-foreground">
            Edit: {agreement.data?.agreement_number}
          </span>
        ) : (
          <span className="text-foreground">New Agreement</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={isEdit ? `/rentals/${uuid}` : "/rentals"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {isEdit ? "Edit Agreement" : "New Agreement"}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-md border border-border bg-card p-6 space-y-5">
          {/* Direction */}
          <div className="space-y-1.5">
            <Label>
              Direction <span className="text-destructive">*</span>
            </Label>
            {isEdit ? (
              <p className="text-sm font-medium">
                {DIRECTION_LABELS[agreement.data?.direction ?? ""] ??
                  agreement.data?.direction}
              </p>
            ) : (
              <Controller
                name="direction"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Rental In</SelectItem>
                      <SelectItem value="out">Rental Out</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {errors.direction && (
              <p className="text-xs text-destructive">
                {errors.direction.message}
              </p>
            )}
          </div>

          {/* Vendor Name */}
          <div className="space-y-1.5">
            <Label htmlFor="vendor_name">
              Vendor Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vendor_name"
              placeholder="e.g. ABC Equipment Rentals"
              {...register("vendor_name")}
            />
            {errors.vendor_name && (
              <p className="text-xs text-destructive">
                {errors.vendor_name.message}
              </p>
            )}
          </div>

          {/* Vendor Contact + Phone */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vendor_contact">Vendor Contact</Label>
              <Input
                id="vendor_contact"
                placeholder="e.g. John Doe"
                {...register("vendor_contact")}
              />
              {errors.vendor_contact && (
                <p className="text-xs text-destructive">
                  {errors.vendor_contact.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendor_phone">Vendor Phone</Label>
              <Input
                id="vendor_phone"
                placeholder="e.g. +1 555-0100"
                {...register("vendor_phone")}
              />
              {errors.vendor_phone && (
                <p className="text-xs text-destructive">
                  {errors.vendor_phone.message}
                </p>
              )}
            </div>
          </div>

          {/* Vendor Email */}
          <div className="space-y-1.5">
            <Label htmlFor="vendor_email">Vendor Email</Label>
            <Input
              id="vendor_email"
              type="email"
              placeholder="e.g. vendor@example.com"
              {...register("vendor_email")}
            />
            {errors.vendor_email && (
              <p className="text-xs text-destructive">
                {errors.vendor_email.message}
              </p>
            )}
          </div>

          {/* Start + End Date */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="start_date"
                type="date"
                {...register("start_date")}
              />
              {errors.start_date && (
                <p className="text-xs text-destructive">
                  {errors.start_date.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="end_date"
                type="date"
                {...register("end_date")}
              />
              {errors.end_date && (
                <p className="text-xs text-destructive">
                  {errors.end_date.message}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this agreement..."
              rows={3}
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-xs text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>
        </div>

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
            <Link to={isEdit ? `/rentals/${uuid}` : "/rentals"}>
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
                : "Create Agreement"}
          </Button>
        </div>
      </form>
    </div>
  );
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
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
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
