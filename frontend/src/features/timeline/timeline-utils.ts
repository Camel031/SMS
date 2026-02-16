import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  addWeeks,
  addMonths,
  addQuarters,
  differenceInMilliseconds,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
} from "date-fns";
import type { TimeScale } from "@/types/timeline";

export function getTimeRange(
  scale: TimeScale,
  anchor: Date,
): { start: Date; end: Date } {
  switch (scale) {
    case "week":
      return {
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end: endOfWeek(anchor, { weekStartsOn: 1 }),
      };
    case "month":
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "quarter":
      return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
  }
}

export function navigate(
  scale: TimeScale,
  anchor: Date,
  direction: 1 | -1,
): Date {
  switch (scale) {
    case "week":
      return addWeeks(anchor, direction);
    case "month":
      return addMonths(anchor, direction);
    case "quarter":
      return addQuarters(anchor, direction);
  }
}

export function barPosition(
  barStart: Date,
  barEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
  trackWidth: number,
): { left: number; width: number } {
  const totalMs = differenceInMilliseconds(rangeEnd, rangeStart);
  if (totalMs <= 0) return { left: 0, width: 0 };

  const clampedStart = barStart < rangeStart ? rangeStart : barStart;
  const clampedEnd = barEnd > rangeEnd ? rangeEnd : barEnd;
  const leftMs = differenceInMilliseconds(clampedStart, rangeStart);
  const widthMs = differenceInMilliseconds(clampedEnd, clampedStart);

  return {
    left: (leftMs / totalMs) * trackWidth,
    width: Math.max((widthMs / totalMs) * trackWidth, 2), // min 2px visible
  };
}

export function getGridLines(
  scale: TimeScale,
  start: Date,
  end: Date,
): { date: Date; label: string }[] {
  switch (scale) {
    case "week":
      return eachDayOfInterval({ start, end }).map((d) => ({
        date: d,
        label: format(d, "EEE d"),
      }));
    case "month":
      return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(
        (d) => ({ date: d, label: format(d, "MMM d") }),
      );
    case "quarter":
      return eachMonthOfInterval({ start, end }).map((d) => ({
        date: d,
        label: format(d, "MMM"),
      }));
  }
}

export function getRangeLabel(scale: TimeScale, start: Date, end: Date): string {
  switch (scale) {
    case "week":
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    case "month":
      return format(start, "MMMM yyyy");
    case "quarter":
      return `Q${Math.ceil((start.getMonth() + 1) / 3)} ${format(start, "yyyy")}`;
  }
}
