import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  Edit,
  Plus,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useEquipmentModel,
  useEquipmentItems,
  useCustomFields,
} from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import type { EquipmentStatus } from "@/types/equipment";

const STATUS_CONFIG: Record<EquipmentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  available: { label: "Available", variant: "success" },
  out: { label: "Out", variant: "warning" },
  reserved: { label: "Reserved", variant: "info" },
  pending_receipt: { label: "Pending", variant: "secondary" },
  lost: { label: "Lost", variant: "destructive" },
  retired: { label: "Retired", variant: "outline" },
  returned_to_vendor: { label: "Returned", variant: "outline" },
};

export default function EquipmentModelDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const model = useEquipmentModel(uuid ?? "");
  const items = useEquipmentItems(
    uuid ? { model_uuid: uuid } : undefined,
  );
  const customFields = useCustomFields({ entity_type: "equipment_model" });
  const perms = usePermission();

  if (model.isLoading) {
    return <DetailSkeleton />;
  }

  if (!model.data) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <Package className="h-10 w-10 mb-3 opacity-40" />
        <p>Equipment model not found</p>
      </div>
    );
  }

  const m = model.data;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/equipment" className="hover:text-foreground transition-colors">
          Equipment
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">{m.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/equipment">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {m.brand && <span className="text-muted-foreground">{m.brand} </span>}
                {m.name}
              </h1>
              <p className="text-sm text-muted-foreground">{m.category_path}</p>
            </div>
          </div>
        </div>
        {perms.canManageEquipment && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/equipment/models/${uuid}/edit`}>
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
            {m.is_numbered && (
              <Button size="sm" asChild>
                <Link to={`/equipment/items/new?model=${uuid}`}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Items" value={m.is_numbered ? m.item_count : m.total_quantity} />
        <StatCard label="Available" value={m.is_numbered ? m.available_count : "—"} />
        <StatCard
          label="Type"
          value={m.is_numbered ? "Numbered" : "Bulk"}
        />
        <StatCard
          label="Model #"
          value={m.model_number || "—"}
          mono
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items ({m.item_count})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          {Object.keys(m.custom_fields).length > 0 && (
            <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="items">
          {!m.is_numbered ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              This is bulk (unnumbered) equipment tracked by quantity only.
              <br />
              Total quantity: <span className="font-mono font-medium text-foreground">{m.total_quantity}</span>
            </div>
          ) : items.isLoading ? (
            <ItemsSkeleton />
          ) : items.data?.results.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No items registered for this model yet.
            </div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial #</TableHead>
                    <TableHead>Internal ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ownership</TableHead>
                    <TableHead className="text-center">Faults</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.data?.results.map((item) => {
                    const statusCfg = STATUS_CONFIG[item.current_status];
                    return (
                      <TableRow key={item.uuid}>
                        <TableCell>
                          <Link
                            to={`/equipment/items/${item.uuid}`}
                            className="font-mono text-sm font-medium hover:text-primary transition-colors"
                          >
                            {item.serial_number}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {item.internal_id || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg?.variant ?? "outline"}>
                            {statusCfg?.label ?? item.current_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.ownership_type === "rented_in" ? "Rented In" : "Owned"}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.active_fault_count > 0 && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {item.active_fault_count}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="w-8">
                          <Link to={`/equipment/items/${item.uuid}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="details">
          <div className="rounded-md border border-border p-4 space-y-3">
            <DetailRow label="Description" value={m.description || "No description"} />
            <DetailRow label="Category" value={m.category_path} />
            <DetailRow label="Brand" value={m.brand || "—"} />
            <DetailRow label="Model Number" value={m.model_number || "—"} mono />
            <DetailRow label="Created" value={new Date(m.created_at).toLocaleDateString()} />
            <DetailRow label="Last Updated" value={new Date(m.updated_at).toLocaleDateString()} />
          </div>
        </TabsContent>

        <TabsContent value="custom-fields">
          <div className="rounded-md border border-border p-4 space-y-3">
            {customFields.data?.results
              .filter((def) => m.custom_fields[def.slug] !== undefined)
              .map((def) => (
                <DetailRow
                  key={def.slug}
                  label={def.name}
                  value={String(m.custom_fields[def.slug] ?? "—")}
                />
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-32 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((r) => (
            <TableRow key={r}>
              {[1, 2, 3, 4, 5].map((c) => (
                <TableCell key={c}><Skeleton className="h-4 w-24" /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
