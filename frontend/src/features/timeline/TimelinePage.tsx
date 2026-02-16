import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useTimelineData } from "@/hooks/use-timeline";
import { useCategories } from "@/hooks/use-equipment";
import type { TimeScale } from "@/types/timeline";
import { getTimeRange, navigate as navFn, getRangeLabel } from "./timeline-utils";
import GanttChart from "./GanttChart";
import AgendaList from "./AgendaList";

const SCALE_OPTIONS: { value: TimeScale; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

export default function TimelinePage() {
  const [scale, setScale] = useState<TimeScale>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [categoryUuid, setCategoryUuid] = useState<string>("");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const { start, end } = useMemo(() => getTimeRange(scale, anchor), [scale, anchor]);

  const { data, isLoading } = useTimelineData({
    start: start.toISOString(),
    end: end.toISOString(),
    category: categoryUuid || undefined,
    include_drafts: includeDrafts,
  });

  const { data: categories } = useCategories();

  const rangeLabel = useMemo(() => getRangeLabel(scale, start, end), [scale, start, end]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Equipment Timeline
        </h1>
        <p className="text-sm text-muted-foreground">
          Visualize equipment allocation across schedules
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Scale selector */}
        <div className="flex rounded-md border border-border">
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                scale === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/10"
              }`}
              onClick={() => setScale(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-1">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
            onClick={() => setAnchor(navFn(scale, anchor, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/10"
            onClick={() => setAnchor(new Date())}
          >
            {rangeLabel}
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
            onClick={() => setAnchor(navFn(scale, anchor, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Category filter */}
        {categories && categories.results && categories.results.length > 0 && (
          <select
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
            value={categoryUuid}
            onChange={(e) => setCategoryUuid(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.results.map((cat: { uuid: string; name: string }) => (
              <option key={cat.uuid} value={cat.uuid}>
                {cat.name}
              </option>
            ))}
          </select>
        )}

        {/* Drafts toggle */}
        <div className="flex items-center gap-2">
          <Switch
            checked={includeDrafts}
            onCheckedChange={setIncludeDrafts}
            id="include-drafts"
          />
          <label
            htmlFor="include-drafts"
            className="text-xs text-muted-foreground"
          >
            Show Drafts
          </label>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          {/* Desktop Gantt */}
          <div className="hidden md:block">
            <GanttChart
              rows={data?.rows ?? []}
              rangeStart={start}
              rangeEnd={end}
              scale={scale}
              expandedModel={expandedModel}
              onToggleExpand={(uuid) =>
                setExpandedModel((prev) => (prev === uuid ? null : uuid))
              }
            />
          </div>

          {/* Mobile Agenda */}
          <div className="block md:hidden">
            <AgendaList rows={data?.rows ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
