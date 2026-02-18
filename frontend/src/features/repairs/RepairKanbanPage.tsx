import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench, Clock, ArrowRight, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useSchedules } from "@/hooks/use-schedules";
import type { ScheduleListItem, ScheduleStatus, ScheduleDetail } from "@/types/schedule";

// ─── Column definitions ─────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  label: string;
  statuses: ScheduleStatus[];
  variant: "secondary" | "warning" | "success";
}

const COLUMNS: KanbanColumn[] = [
  { id: "pending", label: "Pending", statuses: ["draft", "confirmed"], variant: "secondary" },
  { id: "in_progress", label: "In Progress", statuses: ["in_progress"], variant: "warning" },
  { id: "completed", label: "Completed", statuses: ["completed"], variant: "success" },
];

// ─── Helpers ────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function groupByColumn(items: ScheduleListItem[]): Record<string, ScheduleListItem[]> {
  const groups: Record<string, ScheduleListItem[]> = {};
  for (const col of COLUMNS) groups[col.id] = [];
  for (const item of items) {
    const col = COLUMNS.find((c) => c.statuses.includes(item.status));
    if (col) groups[col.id].push(item);
  }
  return groups;
}

// ─── Page Component ─────────────────────────────────────────────────

export default function RepairKanbanPage() {
  const repairs = useSchedules({ type: "external_repair" });
  const items = repairs.data?.results ?? [];
  const grouped = useMemo(() => groupByColumn(items), [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Repairs</h1>
          <p className="text-sm text-muted-foreground">
            Track external repair schedules across stages.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/schedules/new?type=external_repair">
            <Wrench className="h-3.5 w-3.5 mr-1" />
            New Repair
          </Link>
        </Button>
      </div>

      {repairs.isLoading ? (
        <KanbanSkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No repair schedules found. Create one from the Schedules page.
        </div>
      ) : (
        <>
          {/* Desktop: 3-column kanban */}
          <div className="hidden md:block">
            <KanbanBoard grouped={grouped} />
          </div>
          {/* Mobile: tab layout */}
          <div className="md:hidden">
            <MobileKanban grouped={grouped} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Desktop Kanban ─────────────────────────────────────────────────

function KanbanBoard({ grouped }: { grouped: Record<string, ScheduleListItem[]> }) {
  const qc = useQueryClient();

  const beginMutation = useMutation({
    mutationFn: async (uuid: string) => {
      const { data } = await api.post<ScheduleDetail>(`/schedules/${uuid}/begin/`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
    onError: () => toast.error("Failed to begin schedule"),
  });

  const completeMutation = useMutation({
    mutationFn: async (uuid: string) => {
      const { data } = await api.post<ScheduleDetail>(`/schedules/${uuid}/complete/`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
    onError: () => toast.error("Failed to complete schedule"),
  });

  const handleDragEnd = (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const targetCol = destination.droppableId;
    if (targetCol === "in_progress") {
      beginMutation.mutate(draggableId);
    } else if (targetCol === "completed") {
      completeMutation.mutate(draggableId);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <Droppable key={col.id} droppableId={col.id}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`rounded-lg border border-border bg-muted/30 p-3 min-h-[300px] transition-colors ${
                  snapshot.isDraggingOver ? "bg-muted/60 ring-1 ring-primary/20" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <Badge variant={col.variant}>{grouped[col.id].length}</Badge>
                </div>
                <div className="space-y-2">
                  {grouped[col.id].map((item, index) => (
                    <Draggable key={item.uuid} draggableId={item.uuid} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={dragSnapshot.isDragging ? "opacity-80 rotate-1" : ""}
                        >
                          <RepairCard item={item} showReturnButton={col.id === "completed"} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}

// ─── Mobile Kanban ──────────────────────────────────────────────────

function MobileKanban({ grouped }: { grouped: Record<string, ScheduleListItem[]> }) {
  return (
    <Tabs defaultValue="pending">
      <TabsList className="w-full">
        {COLUMNS.map((col) => (
          <TabsTrigger key={col.id} value={col.id} className="flex-1">
            {col.label} ({grouped[col.id].length})
          </TabsTrigger>
        ))}
      </TabsList>
      {COLUMNS.map((col) => (
        <TabsContent key={col.id} value={col.id}>
          {grouped[col.id].length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No repairs in this stage.
            </div>
          ) : (
            <div className="space-y-2">
              {grouped[col.id].map((item) => (
                <RepairCard
                  key={item.uuid}
                  item={item}
                  showReturnButton={col.id === "completed"}
                />
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ─── Repair Card ────────────────────────────────────────────────────

function RepairCard({
  item,
  showReturnButton,
}: {
  item: ScheduleListItem;
  showReturnButton?: boolean;
}) {
  const days = daysSince(item.start_datetime);

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/schedules/${item.uuid}`}
          className="text-sm font-medium hover:underline line-clamp-2"
        >
          {item.title}
        </Link>
        {days > 0 && (
          <Badge variant={days > 14 ? "destructive" : "outline"} className="shrink-0 text-xs">
            <Clock className="h-3 w-3 mr-0.5" />
            {days}d
          </Badge>
        )}
      </div>

      {item.customer_name && (
        <p className="text-xs text-muted-foreground truncate">
          Customer: <span className="text-foreground">{item.customer_name}</span>
        </p>
      )}

      {item.notes && (
        <p className="text-xs text-muted-foreground line-clamp-2">{item.notes}</p>
      )}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{item.equipment_count} item{item.equipment_count !== 1 ? "s" : ""}</span>
        <span>&middot;</span>
        <span>{new Date(item.start_datetime).toLocaleDateString()}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{new Date(item.end_datetime).toLocaleDateString()}</span>
      </div>

      {item.has_conflicts && (
        <Badge variant="destructive" className="text-xs">Conflict</Badge>
      )}

      {showReturnButton && (
        <Button variant="outline" size="sm" className="w-full mt-1" asChild>
          <Link to={`/warehouse/check-in?schedule=${item.uuid}`}>
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Return to Warehouse
          </Link>
        </Button>
      )}
    </div>
  );
}

// ─── Skeletons ──────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((col) => (
        <div key={col} className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <Skeleton className="h-5 w-24" />
          {[1, 2].map((card) => (
            <Skeleton key={card} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
