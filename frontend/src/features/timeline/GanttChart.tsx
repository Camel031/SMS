import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TimelineRow, TimelineBar, TimeScale } from "@/types/timeline";
import { barPosition, getGridLines } from "./timeline-utils";

const BAR_HEIGHT = 24;
const BAR_GAP = 4;
const ROW_PADDING = 8;
const LABEL_WIDTH = 200;

const TYPE_COLORS: Record<string, string> = {
  event: "bg-blue-500",
  external_repair: "bg-amber-500",
  rental_out: "bg-purple-500",
};

const TYPE_LABELS: Record<string, string> = {
  event: "Event",
  external_repair: "Repair",
  rental_out: "Rental",
};

interface GanttChartProps {
  rows: TimelineRow[];
  rangeStart: Date;
  rangeEnd: Date;
  scale: TimeScale;
  expandedModel: string | null;
  onToggleExpand: (uuid: string) => void;
}

export default function GanttChart({
  rows,
  rangeStart,
  rangeEnd,
  scale,
  expandedModel,
  onToggleExpand,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackWidth = getTrackWidth(scale);
  const gridLines = useMemo(
    () => getGridLines(scale, rangeStart, rangeEnd),
    [scale, rangeStart, rangeEnd],
  );
  const navigate = useNavigate();

  // Today marker position
  const now = new Date();
  const todayPos =
    now >= rangeStart && now <= rangeEnd
      ? barPosition(now, now, rangeStart, rangeEnd, trackWidth).left
      : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto" ref={containerRef}>
          <div style={{ minWidth: LABEL_WIDTH + trackWidth }}>
            {/* Header row with grid labels */}
            <div className="flex border-b border-border bg-secondary/30">
              <div
                className="shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground"
                style={{ width: LABEL_WIDTH }}
              >
                Equipment Model
              </div>
              <div className="relative flex-1" style={{ width: trackWidth }}>
                {gridLines.map((line, i) => {
                  const pos = barPosition(
                    line.date,
                    line.date,
                    rangeStart,
                    rangeEnd,
                    trackWidth,
                  );
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/40 px-1 py-2 text-[10px] text-muted-foreground"
                      style={{ left: pos.left }}
                    >
                      {line.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Data rows */}
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No equipment allocated in this period
              </div>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedModel === row.equipment_model.uuid;
                const rowHeight =
                  ROW_PADDING * 2 +
                  Math.max(1, row.bars.length) * (BAR_HEIGHT + BAR_GAP) -
                  BAR_GAP;

                return (
                  <div key={row.equipment_model.uuid}>
                    <div className="flex border-b border-border hover:bg-accent/5">
                      {/* Label column */}
                      <button
                        className="shrink-0 border-r border-border px-3 py-2 text-left"
                        style={{ width: LABEL_WIDTH }}
                        onClick={() =>
                          onToggleExpand(row.equipment_model.uuid)
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronRight
                            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {row.equipment_model.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {row.equipment_model.category_name} &middot;{" "}
                              {row.total_dispatchable} available
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* Track area */}
                      <div
                        className="relative flex-1"
                        style={{ width: trackWidth, height: rowHeight }}
                      >
                        {/* Grid lines */}
                        {gridLines.map((line, i) => {
                          const pos = barPosition(
                            line.date,
                            line.date,
                            rangeStart,
                            rangeEnd,
                            trackWidth,
                          );
                          return (
                            <div
                              key={i}
                              className="absolute top-0 bottom-0 border-l border-border/20"
                              style={{ left: pos.left }}
                            />
                          );
                        })}

                        {/* Today marker */}
                        {todayPos !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-destructive/60"
                            style={{ left: todayPos }}
                          />
                        )}

                        {/* Bars */}
                        {row.bars.map((bar, barIdx) => (
                          <GanttBar
                            key={`${bar.schedule_uuid}-${barIdx}`}
                            bar={bar}
                            rangeStart={rangeStart}
                            rangeEnd={rangeEnd}
                            trackWidth={trackWidth}
                            topOffset={
                              ROW_PADDING + barIdx * (BAR_HEIGHT + BAR_GAP)
                            }
                            onClick={() =>
                              navigate(`/schedules/${bar.schedule_uuid}`)
                            }
                          />
                        ))}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-b border-border bg-secondary/10 px-4 py-3">
                        <div className="space-y-1">
                          {row.bars.map((bar, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 text-xs text-muted-foreground"
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${TYPE_COLORS[bar.schedule_type] ?? "bg-muted-foreground"}`}
                              />
                              <span className="font-medium text-foreground">
                                {bar.title}
                              </span>
                              <span>×{bar.quantity_planned}</span>
                              <span className="text-muted-foreground/60">
                                {bar.status}
                              </span>
                              {bar.has_conflict && (
                                <span className="rounded bg-destructive/10 px-1 text-[10px] text-destructive">
                                  Conflict
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function GanttBar({
  bar,
  rangeStart,
  rangeEnd,
  trackWidth,
  topOffset,
  onClick,
}: {
  bar: TimelineBar;
  rangeStart: Date;
  rangeEnd: Date;
  trackWidth: number;
  topOffset: number;
  onClick: () => void;
}) {
  const pos = barPosition(
    new Date(bar.start),
    new Date(bar.end),
    rangeStart,
    rangeEnd,
    trackWidth,
  );

  const colorClass = TYPE_COLORS[bar.schedule_type] ?? "bg-muted-foreground";
  const isDraft = bar.status === "draft";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`absolute flex items-center overflow-hidden rounded text-[10px] font-medium text-white transition-opacity hover:opacity-80 ${colorClass} ${
            isDraft ? "border border-dashed border-white/40 opacity-60" : ""
          } ${bar.has_conflict ? "ring-2 ring-destructive ring-offset-1 ring-offset-card" : ""}`}
          style={{
            left: pos.left,
            width: pos.width,
            top: topOffset,
            height: BAR_HEIGHT,
          }}
          onClick={onClick}
        >
          <span className="truncate px-1.5">{bar.title}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">{bar.title}</p>
          <p className="text-xs text-muted-foreground">
            {TYPE_LABELS[bar.schedule_type] ?? bar.schedule_type} &middot;{" "}
            {bar.status}
          </p>
          <p className="text-xs">Quantity: {bar.quantity_planned}</p>
          {bar.location && (
            <p className="text-xs text-muted-foreground">{bar.location}</p>
          )}
          {bar.has_conflict && (
            <p className="text-xs font-medium text-destructive">
              Over-allocated
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function getTrackWidth(scale: TimeScale): number {
  switch (scale) {
    case "week":
      return 7 * 120; // 120px per day
    case "month":
      return 31 * 40; // ~40px per day
    case "quarter":
      return 92 * 15; // ~15px per day
  }
}
