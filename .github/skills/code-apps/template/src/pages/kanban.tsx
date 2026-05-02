import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  useIncidents,
  useCategories,
  usePriorities,
  useUpdateIncident,
} from "@/hooks/use-incidents";
import type { Geek_incidents } from "@/generated/models/Geek_incidentsModel";
import { IncidentStatus, statusLabels } from "@/types/incident";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";

// ── 型定義 ──

type StatusKey = keyof typeof IncidentStatus;
const COLUMNS: { key: StatusKey; status: number; color: string }[] = [
  { key: "NEW", status: IncidentStatus.NEW, color: "border-t-blue-500" },
  {
    key: "IN_PROGRESS",
    status: IncidentStatus.IN_PROGRESS,
    color: "border-t-yellow-500",
  },
  {
    key: "RESOLVED",
    status: IncidentStatus.RESOLVED,
    color: "border-t-green-500",
  },
  { key: "CLOSED", status: IncidentStatus.CLOSED, color: "border-t-gray-500" },
];

// ── Droppable Column ──

function KanbanColumn({
  status,
  label,
  color,
  count,
  children,
}: {
  status: number;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[260px] w-full rounded-lg border-t-4 ${color} bg-muted/30 ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>
      <ScrollArea
        className="flex-1 px-2 pb-2"
        style={{ maxHeight: "calc(100vh - 14rem)" }}
      >
        <div className="space-y-2 min-h-[60px]">{children}</div>
      </ScrollArea>
    </div>
  );
}

// ── Draggable Card ──

function KanbanCard({
  incident,
  priorityName,
  categoryName,
  onClick,
}: {
  incident: Geek_incidents;
  priorityName: string;
  categoryName: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: incident.geek_incidentid,
    });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${isDragging ? "opacity-50 shadow-lg" : ""}`}
      onClick={() => {
        // ドラッグでなければクリック
        if (!isDragging) onClick();
      }}
    >
      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-medium leading-tight line-clamp-2">
          {incident.geek_name}
        </p>
        <div className="flex flex-wrap gap-1">
          {priorityName && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {priorityName}
            </Badge>
          )}
          {categoryName && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {categoryName}
            </Badge>
          )}
        </div>
        {incident.geek_description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {incident.geek_description}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {incident.createdon
            ? new Date(incident.createdon).toLocaleDateString("ja-JP")
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Overlay Card (drag preview) ──

function OverlayCard({
  incident,
  priorityName,
  categoryName,
}: {
  incident: Geek_incidents;
  priorityName: string;
  categoryName: string;
}) {
  return (
    <Card className="shadow-xl rotate-2 w-[250px]">
      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-medium leading-tight line-clamp-2">
          {incident.geek_name}
        </p>
        <div className="flex flex-wrap gap-1">
          {priorityName && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {priorityName}
            </Badge>
          )}
          {categoryName && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {categoryName}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── メインページ ──

export default function KanbanPage() {
  const navigate = useNavigate();
  const { data: incidents = [], isLoading } = useIncidents();
  const { data: categories = [] } = useCategories();
  const { data: priorities = [] } = usePriorities();
  const updateMutation = useUpdateIncident();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.geek_incidentcategoryid, c.geek_name));
    return m;
  }, [categories]);

  const priorityMap = useMemo(() => {
    const m = new Map<string, string>();
    priorities.forEach((p) => m.set(p.geek_priorityid, p.geek_name));
    return m;
  }, [priorities]);

  // ステータスごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<number, Geek_incidents[]>();
    COLUMNS.forEach((col) => map.set(col.status, []));
    incidents.forEach((inc) => {
      const s = inc.geek_status as number;
      const list = map.get(s);
      if (list) list.push(inc);
      else map.get(IncidentStatus.NEW)?.push(inc); // 不明なステータスは新規に
    });
    return map;
  }, [incidents]);

  const activeIncident = activeId
    ? (incidents.find((i) => i.geek_incidentid === activeId) ?? null)
    : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const overId = over.id as string;
    if (!overId.startsWith("column-")) return;

    const newStatus = Number(overId.replace("column-", ""));
    const inc = incidents.find((i) => i.geek_incidentid === active.id);
    if (!inc || inc.geek_status === newStatus) return;

    const oldLabel = statusLabels[inc.geek_status as number] ?? "?";
    const newLabel = statusLabels[newStatus] ?? "?";

    updateMutation.mutate(
      { id: inc.geek_incidentid, geek_status: newStatus },
      {
        onSuccess: () =>
          toast.success(
            `「${inc.geek_name}」を ${oldLabel} → ${newLabel} に変更しました`,
          ),
        onError: () => toast.error("ステータスの更新に失敗しました"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">カンバンボード</h1>
        <LoadingSkeletonGrid columns={4} count={8} variant="compact" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">カンバンボード</h1>
        <p className="text-sm text-muted-foreground">
          カードをドラッグしてステータスを変更
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = grouped.get(col.status) ?? [];
            return (
              <KanbanColumn
                key={col.key}
                status={col.status}
                label={statusLabels[col.status]}
                color={col.color}
                count={items.length}
              >
                {items.map((inc) => (
                  <KanbanCard
                    key={inc.geek_incidentid}
                    incident={inc}
                    priorityName={
                      priorityMap.get(inc._geek_priorityid_value as string) ??
                      ""
                    }
                    categoryName={
                      categoryMap.get(inc._geek_categoryid_value as string) ??
                      ""
                    }
                    onClick={() =>
                      navigate(`/incidents/${inc.geek_incidentid}`)
                    }
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeIncident && (
            <OverlayCard
              incident={activeIncident}
              priorityName={
                priorityMap.get(
                  activeIncident._geek_priorityid_value as string,
                ) ?? ""
              }
              categoryName={
                categoryMap.get(
                  activeIncident._geek_categoryid_value as string,
                ) ?? ""
              }
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
