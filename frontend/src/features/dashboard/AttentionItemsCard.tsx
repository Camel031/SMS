import { Link } from "react-router-dom";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttentionItems } from "@/hooks/use-dashboard";
import type { AttentionSeverity } from "@/types/dashboard";

const SEVERITY_CONFIG: Record<
  AttentionSeverity,
  { icon: typeof AlertTriangle; color: string; bg: string }
> = {
  critical: {
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
};

export default function AttentionItemsCard() {
  const { data: items, isLoading } = useAttentionItems();

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-medium">Attention Required</h3>
        {items && items.length > 0 && (
          <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {items.length}
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))
        ) : !items?.length ? (
          <div className="flex items-center gap-3 px-4 py-8">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm text-muted-foreground">
              No items requiring attention
            </span>
          </div>
        ) : (
          items.map((item, i) => {
            const config = SEVERITY_CONFIG[item.severity];
            const Icon = config.icon;
            return (
              <Link
                key={`${item.type}-${item.entity_uuid ?? i}`}
                to={item.action_url}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/5"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${config.bg}`}
                >
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
