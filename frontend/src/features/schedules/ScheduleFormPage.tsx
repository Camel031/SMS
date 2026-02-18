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
  useSchedule,
  useCreateSchedule,
  useUpdateSchedule,
} from "@/hooks/use-schedules";
import { toast } from "sonner";

// ─── Zod schema ─────────────────────────────────────────────────────

const scheduleSchema = z
  .object({
    schedule_type: z.enum(["event", "external_repair", "rental_out"]),
    title: z.string().min(1, "Title is required"),
    customer_name: z.string().trim().min(1, "Customer name is required"),
    contact_phone: z.string().optional(),
    start_datetime: z.string().min(1, "Start date/time is required"),
    show_datetime: z.string().optional(),
    end_datetime: z.string().min(1, "End date/time is required"),
    location: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.start_datetime && data.end_datetime) {
        return new Date(data.end_datetime) > new Date(data.start_datetime);
      }
      return true;
    },
    { message: "End must be after start", path: ["end_datetime"] },
  );

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

// ─── Helpers ────────────────────────────────────────────────────────

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  external_repair: "External Repair",
  rental_out: "Rental Out",
};

// ─── Component ──────────────────────────────────────────────────────

export default function ScheduleFormPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const isEdit = !!uuid;
  const navigate = useNavigate();

  // Queries
  const schedule = useSchedule(uuid ?? "");

  // Mutations
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule(uuid ?? "");

  const {
    register,
    handleSubmit,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      schedule_type: "event",
      title: "",
      customer_name: "",
      contact_phone: "",
      start_datetime: "",
      show_datetime: "",
      end_datetime: "",
      location: "",
      notes: "",
    },
  });

  const scheduleType = watch("schedule_type");

  // Populate form for edit mode
  useEffect(() => {
    if (isEdit && schedule.data) {
      const s = schedule.data;
      reset({
        schedule_type: s.schedule_type,
        title: s.title,
        customer_name: s.customer_name || "",
        contact_phone: s.contact_phone || "",
        start_datetime: s.start_datetime
          ? s.start_datetime.slice(0, 16)
          : "",
        show_datetime: s.show_datetime
          ? s.show_datetime.slice(0, 16)
          : "",
        end_datetime: s.end_datetime ? s.end_datetime.slice(0, 16) : "",
        location: s.location || "",
        notes: s.notes || "",
      });
    }
  }, [isEdit, schedule.data, reset]);

  // Submit handler
  const onSubmit = async (values: ScheduleFormValues) => {
    const payload = {
      schedule_type: values.schedule_type,
      title: values.title,
      customer_name: values.customer_name.trim(),
      contact_phone: values.contact_phone || undefined,
      start_datetime: values.start_datetime,
      show_datetime: values.show_datetime || undefined,
      end_datetime: values.end_datetime,
      location: values.location || undefined,
      notes: values.notes || undefined,
    };

    if (isEdit) {
      const result = await updateMutation.mutateAsync(payload);
      toast.success("Schedule updated");
      navigate(`/schedules/${result.uuid}`);
    } else {
      const result = await createMutation.mutateAsync(payload);
      toast.success("Schedule created");
      navigate(`/schedules/${result.uuid}`);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Loading state for edit
  if (isEdit && schedule.isLoading) {
    return <FormSkeleton />;
  }

  // Not found state for edit
  if (isEdit && !schedule.isLoading && !schedule.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <p>Schedule not found</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/schedules">Back to Schedules</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to="/schedules"
          className="hover:text-foreground transition-colors"
        >
          Schedules
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {isEdit ? (
          <span className="text-foreground">
            Edit: {schedule.data?.title}
          </span>
        ) : (
          <span className="text-foreground">New Schedule</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={isEdit ? `/schedules/${uuid}` : "/schedules"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {isEdit ? "Edit Schedule" : "New Schedule"}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-md border border-border bg-card p-6 space-y-5">
          {/* Schedule Type */}
          <div className="space-y-1.5">
            <Label>
              Schedule Type <span className="text-destructive">*</span>
            </Label>
            {isEdit ? (
              <p className="text-sm font-medium">
                {SCHEDULE_TYPE_LABELS[schedule.data?.schedule_type ?? ""] ??
                  schedule.data?.schedule_type}
              </p>
            ) : (
              <Controller
                name="schedule_type"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select schedule type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="external_repair">
                        External Repair
                      </SelectItem>
                      <SelectItem value="rental_out">Rental Out</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {errors.schedule_type && (
              <p className="text-xs text-destructive">
                {errors.schedule_type.message}
              </p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g. Summer Festival 2026"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">
                Customer Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer_name"
                placeholder="e.g. John Doe"
                {...register("customer_name")}
              />
              {errors.customer_name && (
                <p className="text-xs text-destructive">
                  {errors.customer_name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                placeholder="e.g. +1 555-0100"
                {...register("contact_phone")}
              />
              {errors.contact_phone && (
                <p className="text-xs text-destructive">
                  {errors.contact_phone.message}
                </p>
              )}
            </div>
          </div>

          {/* Time Fields */}
          <div
            className={`grid grid-cols-1 gap-4 ${
              scheduleType === "event" ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            <div className="space-y-1.5">
              <Label htmlFor="start_datetime">
                Start Date/Time <span className="text-destructive">*</span>
              </Label>
              <Input
                id="start_datetime"
                type="datetime-local"
                {...register("start_datetime")}
              />
              {errors.start_datetime && (
                <p className="text-xs text-destructive">
                  {errors.start_datetime.message}
                </p>
              )}
            </div>

            {scheduleType === "event" && (
              <div className="space-y-1.5">
                <Label htmlFor="show_datetime">Show Date/Time</Label>
                <Input
                  id="show_datetime"
                  type="datetime-local"
                  {...register("show_datetime")}
                />
                {errors.show_datetime && (
                  <p className="text-xs text-destructive">
                    {errors.show_datetime.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="end_datetime">
                {scheduleType === "external_repair"
                  ? "Expected Return Date"
                  : "End Date/Time"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="end_datetime"
                type="datetime-local"
                {...register("end_datetime")}
              />
              {errors.end_datetime && (
                <p className="text-xs text-destructive">
                  {errors.end_datetime.message}
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g. Convention Center, Hall A"
              {...register("location")}
            />
            {errors.location && (
              <p className="text-xs text-destructive">
                {errors.location.message}
              </p>
            )}
          </div>

          {/* Notes (full-width) */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this schedule..."
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
            <Link to={isEdit ? `/schedules/${uuid}` : "/schedules"}>
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
                : "Create Schedule"}
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
