import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Package,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEquipmentModels, useEquipmentItems, useCategoryTree } from "@/hooks/use-equipment";
import { usePermission } from "@/hooks/use-auth";
import { getQueryLoadState } from "@/lib/query-load-state";
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

export default function EquipmentPage() {
  const [tab, setTab] = useState("models");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const perms = usePermission();

  const modelParams: Record<string, string> = { page: String(page) };
  if (search) modelParams.search = search;
  if (categoryFilter) modelParams.category_uuid = categoryFilter;

  const itemParams: Record<string, string> = { page: String(page) };
  if (search) itemParams.search = search;
  if (categoryFilter) itemParams.category_uuid = categoryFilter;
  if (statusFilter) itemParams.status = statusFilter;

  const models = useEquipmentModels(tab === "models" ? modelParams : undefined);
  const items = useEquipmentItems(tab === "items" ? itemParams : undefined);
  const categoryTree = useCategoryTree();
  const modelLoadState = getQueryLoadState(models);
  const itemLoadState = getQueryLoadState(items);

  // Flatten category tree for select options
  const flatCategories: Array<{ uuid: string; name: string; depth: number }> = [];
  function flattenTree(nodes: typeof categoryTree.data, depth = 0) {
    if (!nodes) return;
    for (const node of nodes) {
      flatCategories.push({ uuid: node.uuid, name: node.name, depth });
      flattenTree(node.children, depth + 1);
    }
  }
  flattenTree(categoryTree.data);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Equipment</h1>
          <p className="text-sm text-muted-foreground">
            Browse and manage equipment models and items
          </p>
        </div>
        {perms.canManageEquipment && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/equipment/categories">Categories</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/equipment/new">
                <Plus className="h-4 w-4" />
                Add Equipment
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="models">
              <Package className="mr-1.5 h-3.5 w-3.5" />
              Models
            </TabsTrigger>
            <TabsTrigger value="items">
              <Package className="mr-1.5 h-3.5 w-3.5" />
              Items
            </TabsTrigger>
          </TabsList>

          {/* Search + Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-48 pl-8 h-8 text-sm"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}
            >
              <SelectTrigger className="w-40 h-8 text-sm">
                <Filter className="mr-1.5 h-3 w-3" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {flatCategories.map((c) => (
                  <SelectItem key={c.uuid} value={c.uuid}>
                    {"  ".repeat(c.depth) + c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tab === "items" && (
              <Select
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}
              >
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Models Tab */}
        <TabsContent value="models">
          <QueryRefreshIndicator show={tab === "models" && modelLoadState.isRefreshing} />
          {tab === "models" && modelLoadState.isInitialLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : models.data?.results.length === 0 ? (
            <EmptyState message="No equipment models found" />
          ) : (
            <>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-center">Type</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.data?.results.map((model) => (
                      <TableRow key={model.uuid}>
                        <TableCell>
                          <Link
                            to={`/equipment/models/${model.uuid}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {model.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {model.brand || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{model.category_name}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={model.is_numbered ? "outline" : "secondary"}>
                            {model.is_numbered ? "Numbered" : "Bulk"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {model.is_numbered ? model.item_count : model.total_quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {model.is_numbered ? model.available_count : "—"}
                        </TableCell>
                        <TableCell className="w-8">
                          <Link to={`/equipment/models/${model.uuid}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                count={models.data?.count ?? 0}
                page={page}
                onPageChange={setPage}
              />
            </>
          )}
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items">
          <QueryRefreshIndicator show={tab === "items" && itemLoadState.isRefreshing} />
          {tab === "items" && itemLoadState.isInitialLoading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : items.data?.results.length === 0 ? (
            <EmptyState message="No equipment items found" />
          ) : (
            <>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial #</TableHead>
                      <TableHead>Internal ID</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
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
                              className="font-mono text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {item.serial_number}
                            </Link>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {item.internal_id || "—"}
                          </TableCell>
                          <TableCell>
                            {item.model_brand && (
                              <span className="text-muted-foreground">{item.model_brand} </span>
                            )}
                            {item.model_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{item.category_name}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusCfg?.variant ?? "outline"}>
                              {statusCfg?.label ?? item.current_status}
                            </Badge>
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
              <Pagination
                count={items.data?.count ?? 0}
                page={page}
                onPageChange={setPage}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

function Pagination({
  count,
  page,
  onPageChange,
  pageSize = 20,
}: {
  count: number;
  page: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
}) {
  const totalPages = Math.ceil(count / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">
        {count} total results
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="flex items-center px-3 text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16">
      <Package className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
