# ReactFlow 可視化パターン

Code Apps で「関係性・依存関係・フロー図・組織図・自由配置のガントチャート」を可視化するときの標準パターン。
**可視化リクエストでは ReactFlow（`@xyflow/react`）を第一候補として検討する。** 単純な集計（件数・合計・比率）は
`ChartDashboard`（Recharts）、ドラッグリサイズ中心の定型ガントは `GanttChart`（dnd-kit）でも良いが、
**関係性の表現・時間軸への自由配置・ズーム/パン操作**が絡む場合は ReactFlow を優先する。

## いつ ReactFlow を使うか

| ニーズ | 推奨 |
|---|---|
| 件数・合計・比率などの集計 | `ChartDashboard`（Recharts） |
| todo/in-progress/done 等の定型カンバン | `KanbanBoard`（dnd-kit） |
| ドラッグリサイズ中心の定型ガント | `GanttChart`（dnd-kit） |
| **自由配置・ズーム可能なガントチャート**（工場×期間など2軸配置） | **ReactFlow カスタムノード** |
| **関係性・依存関係・親子・ネットワーク** | **ReactFlow**（ノード＋エッジ） |
| **組織図・プロセスフロー・承認フロー** | **ReactFlow**（ノード＋エッジ、階層レイアウト） |

## セットアップ

```bash
npm install @xyflow/react
```

```tsx
// styles/index.pcss へ 1 行追加（ReactFlow 標準スタイル）
@import "@xyflow/react/dist/style.css";
```

CSP 制約下でも安全（外部 API 呼び出し無し、純粋なクライアントサイド描画）。`getClient(dataSourcesInfo)` で取得した
Dataverse データを `nodes` / `edges` に変換するだけで良い。

## パターン 0: 汎用カンバンボード（dnd-kit、モダン UI）

OptionSet のステータスをドラッグ＆ドロップで切り替える軽量カンバン。列ヘッダーは色付きチップ + 件数バッジ、
カードは角丸・影付きでホバー時にわずかに浮き上がる。ドラッグ中は `DragOverlay` で浮遊表示にし、元の位置は
`opacity-0` にして重複描画とレイアウトの跳ねを防ぐ（Trello/Linear 系カンバンの標準挙動）。

```tsx
// src/components/kanban-board.tsx
import { type ReactNode, useState } from "react"
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
}

function KanbanCardContent({ item, dragging }: { item: KanbanCardItem; dragging?: boolean }) {
  return (
    <Card className={cn(
      "rounded-xl border-border/60 py-0 shadow-sm transition-shadow",
      dragging ? "rotate-1 shadow-lg ring-1 ring-primary/30" : "hover:shadow-md",
    )}>
      <CardContent className="space-y-1 p-3">
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
  const activeItem = activeId ? items.find((i) => i.id === activeId) : null

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const newColumnValue = Number(over.id)
    const item = items.find((i) => i.id === String(active.id))
    if (item && item.columnValue !== newColumnValue) onMove(String(active.id), newColumnValue)
  }

  return (
    <DndContext sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <KanbanColumn key={col.value} col={col} items={items.filter((i) => i.columnValue === col.value)} onCardClick={onCardClick} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeItem ? <KanbanCardContent item={activeItem} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
```

`colorClass` には `choiceMaps()` 由来のバッジ色（`bg-badge-* text-badge-*-foreground`）をそのまま渡せる。
見出しはフルカラーの帯ではなく「チップ」にとどめることで、ダーク/ライト双方で圧迫感のないモダンな見た目になる。

## パターン 1: ガントチャート（カスタムノードで時間軸配置）

行 = カテゴリ（工場・担当者等）、列 = 時間軸。ノードをバー状にカスタム描画し、`position.x` を日数×px、
`position.y` をレーン番号×行高で計算する。**バーの幅・高さは `data` ではなく Node 本体の `width`/`height`
に設定する**（`NodeResizeControl` によるドラッグ拡縮を有効にする場合、内部で Node の寸法を直接書き換える
ため、`data` 内に固定 px 幅を持たせると表示とズレる）。

バーの色は共通の `categoryColor()`（[カラーパレット集の共通カテゴリ配色](color-palettes.md)）を使う。
パレットは黒・グレーのような低彩度色を含めず、彩度・明度を揃えた識別しやすい色のみで構成する。進捗フィルは
半透明の重ね塗りにせず **単色でくっきり**塗り、ラベルは半透明チップに乗せて背景色に関わらず可読性を確保する
（`src/lib/category-color.ts` の定義は [カラーパレット集の「カテゴリ配色パレットは全パレット共通」](color-palettes.md) を参照。ここでは再掲しない）。

```tsx
// src/components/gantt/gantt-bar-node.tsx
import {
  Handle, Position, NodeResizeControl, ResizeControlVariant,
  type NodeProps, type ResizeParams,
} from "@xyflow/react"
import { cn } from "@/lib/utils"

export type GanttBarData = {
  label: string
  subLabel?: string
  progress: number            // 0-100
  color: string                // カテゴリ色（hex）
  variant?: "bar" | "label"    // "label" = レーン見出し（工場名など）を左端に置く場合
  badge?: string | false       // 右端バッジ文言。false で非表示。未指定時は `${progress}%`
  resizable?: boolean          // true でドラッグして期間（幅）を変更できるハンドルを表示
  onResizeEnd?: (params: ResizeParams) => void  // リサイズ確定時。日付変換・永続化はページ側で行う
}

export const GANTT_BAR_HEIGHT = 36 // レーン行高（ROW_H）より小さくして行間の余白を確保
const MIN_BAR_WIDTH = 24

export function GanttBarNode({ data, selected }: NodeProps) {
  const d = data as unknown as GanttBarData

  if (d.variant === "label") {
    return (
      <div className="flex h-full w-full items-center justify-end truncate pr-3 text-[11px] font-semibold text-muted-foreground">
        {d.label}
        <Handle type="source" position={Position.Right} className="opacity-0" />
      </div>
    )
  }

  const progress = Math.max(0, Math.min(100, d.progress))
  const badgeText = d.badge === false ? null : (d.badge ?? `${progress}%`)
  const resizeHandleStyle = { width: 12, background: "transparent", border: "none" }

  return (
    <div
      className={cn(
        "group relative h-full w-full rounded-lg border border-black/10 bg-card shadow-sm",
        "transition-shadow duration-150 hover:z-10 hover:shadow-md",
        selected && "ring-2 ring-primary/60",
      )}
      title={`${d.label}${d.subLabel ? ` / ${d.subLabel}` : ""} ・ ${progress}%`}
    >
      {/* 塗り分け: 背景は淡色トーン、進捗フィルは単色でくっきり見せる */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <div className="absolute inset-0" style={{ backgroundColor: `${d.color}26` }} />
        <div className="absolute inset-y-0 left-0 transition-[width] duration-300"
          style={{ width: `${progress}%`, backgroundColor: d.color }} />
      </div>
      {/* 左アクセントバー: カテゴリ色を常に主張させる */}
      <div className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ backgroundColor: d.color }} />

      <div className="relative flex h-full items-center gap-1.5 pl-3 pr-1.5">
        {/* ラベルは半透明チップに乗せ、進捗フィルの濃淡に関わらず視認性を確保 */}
        <span className="truncate rounded bg-background/85 px-1 py-0.5 text-[11px] font-semibold leading-none text-foreground shadow-sm">
          {d.label}
        </span>
        {d.subLabel && (
          <span className="hidden truncate rounded bg-background/70 px-1 py-0.5 text-[10px] leading-none text-muted-foreground sm:inline">
            {d.subLabel}
          </span>
        )}
        {badgeText && (
          <span className="ml-auto shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums shadow-sm ring-1 ring-black/10"
            style={{ color: d.color }}>
            {badgeText}
          </span>
        )}
      </div>

      {d.resizable && (
        <>
          <NodeResizeControl position="left" variant={ResizeControlVariant.Line} minWidth={MIN_BAR_WIDTH}
            style={resizeHandleStyle} onResizeEnd={(_, params) => d.onResizeEnd?.(params)}>
            <div className="flex h-full items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <div className="h-4 w-1 rounded-full bg-primary shadow" />
            </div>
          </NodeResizeControl>
          <NodeResizeControl position="right" variant={ResizeControlVariant.Line} minWidth={MIN_BAR_WIDTH}
            style={resizeHandleStyle} onResizeEnd={(_, params) => d.onResizeEnd?.(params)}>
            <div className="flex h-full items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <div className="h-4 w-1 rounded-full bg-primary shadow" />
            </div>
          </NodeResizeControl>
        </>
      )}

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
}
```

`NodeResizeControl` は `nodesDraggable={false}` でも独立して機能する（ノード位置ドラッグとは別系統の
d3-drag ハンドラのため）。ハンドルはデフォルトで透明にし、バーに `group` を付けて `hover:` で表示するため、
通常時は圧迫感がなく、必要なときだけ発見できる。`onResizeEnd` は最終的な絶対座標 `{ x, y, width, height }`
を返すので、リサイズの起点が左右どちらでも同じ計算式（`origin + x/DAY_PX` 日 〜 `+ width/DAY_PX` 日）で
開始日・終了日を再計算できる。

```tsx
// ページ側: 日付→x座標変換、レーン割当、ノード生成、リサイズ確定時の永続化
const DAY_MS = 86400000
const DAY_PX = 12
const ROW_H = 44

function toX(date: Date, origin: Date) {
  return Math.round((date.getTime() - origin.getTime()) / DAY_MS) * DAY_PX
}

const nodes = useMemo(() => {
  return plans.map((p) => ({
    id: p.id,
    type: "ganttBar",
    position: { x: toX(new Date(p.start), origin), y: laneIndex.get(p.laneKey)! * ROW_H },
    width: Math.max(DAY_PX * p.durationDays, DAY_PX * 7),
    height: GANTT_BAR_HEIGHT,
    data: {
      label: p.name, progress: p.progress,
      color: categoryColor(p.category),
      resizable: true,
      onResizeEnd: (params: ResizeParams) => handleResize(p.id, params),
    },
    draggable: false,
  }))
}, [plans, origin, laneIndex])

// ドラッグでバーを伸縮したら開始日・終了日を再計算して Dataverse に永続化
function handleResize(id: string, params: ResizeParams) {
  const newStart = new Date(origin.getTime() + Math.round(params.x / DAY_PX) * DAY_MS)
  const newDurationDays = Math.max(1, Math.round(params.width / DAY_PX))
  const newEnd = new Date(newStart.getTime() + newDurationDays * DAY_MS)
  updatePlanM.mutate({ id, data: { periodstart: newStart.toISOString(), periodend: newEnd.toISOString() } })
}

// レーン見出し（左端に固定表示、パン・ズームに追従させたい場合は position.x を負の固定値に）
const laneLabelNodes = useMemo(() => laneKeys.map((key, i) => ({
  id: `lane-${key}`,
  type: "ganttBar",
  position: { x: -160, y: i * ROW_H },
  width: 140,
  height: GANTT_BAR_HEIGHT,
  data: { label: laneNames.get(key) ?? "", progress: 0, color: "#6b7280", variant: "label" },
  draggable: false,
  selectable: false,
})), [laneKeys, laneNames])

<ReactFlow
  nodes={[...laneLabelNodes, ...nodes]}
  edges={[]}
  nodeTypes={{ ganttBar: GanttBarNode }}
  nodesDraggable={false}
  nodesConnectable={false}
  panOnScroll
  zoomOnScroll={false}
  fitView
>
  <Background variant={BackgroundVariant.Lines} gap={DAY_PX * 7} />
</ReactFlow>
```

月ラベルなどの固定軸は、レーンの外（`y = -40`）に `draggable={false}` の軽量ノードとして同様に配置すると
パン・ズームに追従する。「進捗」の概念がないブロック（在庫の空き枠など）は `badge: false` を指定して
無意味な `100%` 表示を隠す。**期間終了日を持たないレコード（固定幅で表現する枠）には `resizable` を
付けない**（永続化先のフィールドが無いため）。

## パターン 2: 関係図・組織図・依存関係グラフ

ノード＋エッジのシンプルな表現。階層がある場合は親→子を上から下に手動で `y` を段ごとに割り当てる
（自動レイアウトライブラリ `dagre`/`elkjs` の追加導入は要件次第で検討、まずは手動段組みで十分なことが多い）。

```tsx
const nodes = entities.map((e, i) => ({
  id: e.id,
  data: { label: e.name },
  position: { x: (i % cols) * 220, y: levelOf(e) * 120 },
  style: { borderColor: categoryColor(e.category), borderWidth: 2 },
}))

const edges = relations.map((r) => ({
  id: `${r.fromId}-${r.toId}`,
  source: r.fromId,
  target: r.toId,
  animated: r.status === "in-progress",
  markerEnd: { type: MarkerType.ArrowClosed },
}))

<ReactFlow nodes={nodes} edges={edges} fitView>
  <Controls />
  <MiniMap pannable zoomable />
</ReactFlow>
```

## カテゴリ色は共通パレットに集約する（Recharts と共用）

`categoryColor()`／`PALETTE` は **1 箇所のみ**（`src/lib/category-color.ts`）に置き、ページごとに
`PIE_COLORS` のような色配列を複製しない。複製すると、後で低彩度色（黒・グレー）を除去する修正をしても
複製先に反映されず、画面によって視認性の悪い配色が残る（実際に Recharts の `Pie`/`Bar` の `Cell` 色配列が
`category-color.ts` と別に定義され、黒・グレーが再混入した事例がある）。

この共通カテゴリ配色（`--cat-1`〜`--cat-8` / `PALETTE`）と、単一系列用の `--chart-1`〜`--chart-5` との
**使い分けの正典は [カラーパレット集の「カテゴリ配色パレットは全パレット共通」](color-palettes.md)** に置く。
ガント・カンバン・関係図はすべてこの共通パレットの `categoryColor()` を使い、Recharts で系列を色分けする
場合も同じ `PALETTE` を import して `Cell fill={PALETTE[i % PALETTE.length]}` で再利用する。

## 操作性の標準設定

- `nodesDraggable={false}` / `nodesConnectable={false}`: 可視化専用（編集不可）にする場合はノード操作を無効化
- `panOnScroll` + `zoomOnScroll={false}`: 縦横スクロールと拡大縮小の誤操作を防ぐ（ガントチャートで横スクロール優先時）
- 凡例（カテゴリ色チップ）は ReactFlow の外側に通常の React（`<div>` + `<Badge>`）で表示する
- フィルター（工場・カテゴリ・検索）は既存 CRUD 画面と同じ `Select` / `Input` パターンに合わせる
