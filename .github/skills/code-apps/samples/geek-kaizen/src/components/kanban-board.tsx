import { type ReactNode, useEffect, useMemo, useState } from "react"
import {
  DndContext, DragOverlay, type DragEndEvent, type DragStartEvent,
  PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
} from "@dnd-kit/core"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface KanbanColumnDef {
  value: number
  label: string
  /** 見出しチップの色（例: "bg-badge-developer text-badge-developer-foreground"） */
  colorClass?: string
}

export interface KanbanCardItem {
  id: string
  columnValue: number
  title: string
  subtitle?: string
  meta?: ReactNode
  /** カード左端のアクセント色（hex）。ステータス以外の軸（カテゴリ・緊急度等）に付けると識別性が上がる */
  accent?: string
}

function KanbanCardContent({ item, dragging }: { item: KanbanCardItem; dragging?: boolean }) {
  return (
    <Card className={cn(
      "relative overflow-hidden rounded-xl border-border/60 py-0 shadow-sm transition-shadow",
      dragging ? "rotate-1 shadow-lg ring-1 ring-primary/30" : "hover:shadow-md",
    )}>
      {item.accent && <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: item.accent }} />}
      <CardContent className={cn("space-y-1 p-3", item.accent && "pl-3.5")}>
        <p className="truncate text-sm font-medium leading-snug">{item.title}</p>
        {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
        {item.meta}
      </CardContent>
    </Card>
  )
}

function KanbanCard({ item, onCardClick }: { item: KanbanCardItem; onCardClick?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => onCardClick?.(item.id)}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-0")}>
      <KanbanCardContent item={item} />
    </div>
  )
}

function KanbanColumn({ col, items, onCardClick }: {
  col: KanbanColumnDef; items: KanbanCardItem[]; onCardClick?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: String(col.value) })
  return (
    <div ref={setNodeRef} className={cn(
      "flex min-w-[260px] flex-1 flex-col rounded-xl border border-border/60 bg-muted/20 transition-colors duration-150",
      isOver && "border-primary/40 bg-primary/5 ring-1 ring-primary/30",
    )}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", col.colorClass ?? "bg-muted text-foreground")}>
          {col.label}
        </span>
        <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground ring-1 ring-border">
          {items.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        {items.length === 0 ? (
          <div className="flex min-h-[96px] flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground">
            ドラッグしてここに移動
          </div>
        ) : items.map((item) => <KanbanCard key={item.id} item={item} onCardClick={onCardClick} />)}
      </div>
    </div>
  )
}

/** ドラッグ＆ドロップでステータス（OptionSet）を切り替える汎用カンバンボード */
export function KanbanBoard({ columns, items, onMove, onCardClick }: {
  columns: KanbanColumnDef[]
  items: KanbanCardItem[]
  onMove: (id: string, newColumnValue: number) => void
  onCardClick?: (id: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  // ドロップ直後、呼び出し元の状態更新（React Query 等、非同期）が反映されるまでの間だけ列を上書きする。
  // これがないと dnd-kit の DragOverlay が「元の列へ戻る」アニメーションを一瞬描画してしまう。
  // setActiveId(null) と同じ同期更新に含めるのが肝。
  const [pendingMoves, setPendingMoves] = useState<Record<string, number>>({})

  const effectiveItems = useMemo(() => {
    if (Object.keys(pendingMoves).length === 0) return items
    return items.map((i) => (i.id in pendingMoves ? { ...i, columnValue: pendingMoves[i.id] } : i))
  }, [items, pendingMoves])

  // 呼び出し元の items が実際に新しい列を反映したら上書きをクリアする
  useEffect(() => {
    setPendingMoves((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const next = { ...prev }
      let changed = false
      for (const [id, col] of Object.entries(prev)) {
        const actual = items.find((i) => i.id === id)
        if (actual && actual.columnValue === col) { delete next[id]; changed = true }
      }
      return changed ? next : prev
    })
  }, [items])

  const activeItem = activeId ? effectiveItems.find((i) => i.id === activeId) : null

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) { setActiveId(null); return }
    const newColumnValue = Number(over.id)
    const item = effectiveItems.find((i) => i.id === String(active.id))
    if (item && item.columnValue !== newColumnValue) {
      setPendingMoves((prev) => ({ ...prev, [String(active.id)]: newColumnValue }))
      onMove(String(active.id), newColumnValue)
    }
    setActiveId(null)
  }

  return (
    <DndContext sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <KanbanColumn key={col.value} col={col} items={effectiveItems.filter((i) => i.columnValue === col.value)} onCardClick={onCardClick} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeItem ? <KanbanCardContent item={activeItem} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
