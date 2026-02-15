import { Package, CalendarRange, Warehouse, AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          System overview and quick actions
        </p>
      </div>

      {/* Placeholder stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Total Equipment"
          value="—"
          sub="Models registered"
        />
        <StatCard
          icon={CalendarRange}
          label="Active Schedules"
          value="—"
          sub="In progress"
        />
        <StatCard
          icon={Warehouse}
          label="Pending Transactions"
          value="—"
          sub="Awaiting confirmation"
        />
        <StatCard
          icon={AlertTriangle}
          label="Open Faults"
          value="—"
          sub="Unresolved"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Dashboard data will be available after Phase 2+ implementation.
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-lg font-semibold text-foreground">
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
    </div>
  );
}
