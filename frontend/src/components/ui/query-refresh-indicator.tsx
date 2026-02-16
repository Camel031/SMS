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
      role="status"
      aria-live="polite"
      className={cn(
        "mb-2 inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      Refreshing...
    </div>
  );
}
