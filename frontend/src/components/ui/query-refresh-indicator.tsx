import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function QueryRefreshIndicator({
  show,
  className,
}: {
  show: boolean;
  className?: string;
}) {
  if (!show) return null;

  return (
    <div
      className={cn("pointer-events-none relative h-0", className)}
    >
      <div
        role="status"
        aria-live="polite"
        className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Refreshing...
      </div>
    </div>
  );
}
