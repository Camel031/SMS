import { Link } from "react-router-dom";
import {
  Package,
  CalendarRange,
  Warehouse,
  AlertTriangle,
  FileText,
  ArrowLeftRight,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "@/hooks/use-dashboard";
import UpcomingSchedulesCard from "./UpcomingSchedulesCard";
import AttentionItemsCard from "./AttentionItemsCard";
import RecentActivityFeed from "./RecentActivityFeed";

export default function DashboardPage() {
  const summary = useDashboardSummary();
  const d = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          System overview and quick actions
        </p>
      </div>

      {/* Primary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Equipment"
          value={summary.isLoading ? null : String(d?.equipment.total_items ?? 0)}
          sub={`${d?.equipment.items_available ?? 0} available · ${d?.equipment.items_out ?? 0} out`}
          to="/equipment"
        />
        <StatCard
          icon={CalendarRange}
          label="Active Schedules"
          value={summary.isLoading ? null : String(d?.schedules.active ?? 0)}
          sub={`${d?.schedules.draft ?? 0} drafts`}
          to="/schedules"
        />
        <StatCard
          icon={Warehouse}
          label="Pending Confirmations"
          value={summary.isLoading ? null : String(d?.warehouse.pending_confirmations ?? 0)}
          sub="Awaiting verification"
          to="/warehouse/pending"
          highlight={!!d?.warehouse.pending_confirmations}
        />
        <StatCard
          icon={AlertTriangle}
          label="Open Faults"
          value={summary.isLoading ? null : String(d?.faults.open ?? 0)}
          sub="Unresolved"
          highlight={!!d?.faults.open}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={FileText}
          label="Active Rentals"
          value={summary.isLoading ? null : String(d?.rentals.active ?? 0)}
          sub={`${d?.rentals.draft ?? 0} drafts`}
          to="/rentals"
        />
        <StatCard
          icon={ArrowLeftRight}
          label="Planned Transfers"
          value={summary.isLoading ? null : String(d?.transfers.planned ?? 0)}
          sub="Awaiting execution"
          to="/transfers"
          highlight={!!d?.transfers.planned}
        />
        <StatCard
          icon={Package}
          label="Equipment Models"
          value={summary.isLoading ? null : String(d?.equipment.total_models ?? 0)}
          sub="Active models"
          to="/inventory"
        />
      </div>

      {/* Upcoming Schedules + Attention Items */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UpcomingSchedulesCard />
        <AttentionItemsCard />
      </div>

      {/* Recent Activity */}
      <RecentActivityFeed />

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            to="/schedules/new"
            icon={CalendarRange}
            label="New Schedule"
          />
          <QuickAction
            to="/rentals/new"
            icon={FileText}
            label="New Rental Agreement"
          />
          <QuickAction
            to="/warehouse"
            icon={Warehouse}
            label="Warehouse Transactions"
          />
          <QuickAction
            to="/equipment/new"
            icon={Package}
            label="Add Equipment"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  to,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  sub: string;
  to?: string;
  highlight?: boolean;
}) {
  const content = (
    <div
      className={`rounded-lg border bg-card p-4 transition-colors ${
        highlight
          ? "border-warning/50 bg-warning/5"
          : "border-border"
      } ${to ? "hover:border-primary/40 cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-md ${
            highlight ? "bg-warning/10" : "bg-secondary"
          }`}
        >
          <Icon
            className={`h-4 w-4 ${
              highlight ? "text-warning" : "text-primary"
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="h-6 w-12 mt-0.5" />
          ) : (
            <p className="font-mono text-lg font-semibold text-foreground">
              {value}
            </p>
          )}
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        </div>
        {to && (
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        )}
      </div>
    </div>
  );

  if (to) {
    return <Link to={to}>{content}</Link>;
  }
  return content;
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent/5"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-foreground">{label}</span>
    </Link>
  );
}
