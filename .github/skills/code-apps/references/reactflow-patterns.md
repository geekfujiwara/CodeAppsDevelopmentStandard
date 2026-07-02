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
| **負荷×キャパを時間軸で対比**（日/週/月の稼働率・残キャパ・超過） | **CapacityBoard**（積み上げ棒・ライブラリ不要／[パターン 3](#パターン-3-キャパシティ負荷ボード期間ビュー切替積み上げ)） |
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

> ステータスは列そのもの（列ヘッダーの色チップ）で既に表現されているため、カード側の `accent`（左ストライプ・
> 数量バッジ色）は**ステータス以外の軸**に紐づけると情報密度が上がる。自由文字列（商品カテゴリ・工場名等）は
> `categoryColor()`（[design-pattern.md](design-pattern.md) 参照）でハッシュ配色、期日ベースの緊急度は残日数を
> バケット化（例: 3日以内=緊急・7日以内=警戒・それ以上=通常）して割り当てる。色の凡例はクリックでトグルする
> フィルターチップ（件数バッジ付き）にすると、凡例の説明とカードの絞り込みを同時に満たせる。

```tsx
// src/components/kanban-board.tsx
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
  // これがないと dnd-kit の DragOverlay が「元の列へ戻る」アニメーションを一瞬描画してしまう
  // （後述トラブルシュート参照）。setActiveId(null) と同じ同期更新に含めるのが肝。
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
```

`colorClass` には `choiceMaps()` 由来のバッジ色（`bg-badge-* text-badge-*-foreground`）をそのまま渡せる。
見出しはフルカラーの帯ではなく「チップ」にとどめることで、ダーク/ライト双方で圧迫感のないモダンな見た目になる。
`accent`（任意）にステータス/カテゴリ別の hex を渡すと左端に縦ストライプが入り、`meta` に同色の小さな
数値バッジ（例: `backgroundColor: `${accent}1f``）を置くと、列をまたいで一目で状態が読める。

### 呼び出し側: 楽観的更新（React Query）

`onMove` で Dataverse を更新する際は、応答を待たずにキャッシュを書き換えてから `mutate` する。失敗時はスナップショット
に戻す。`KanbanBoard` 側の `pendingMoves` と組み合わせることで、体感の遅延なく・戻りアニメーションも出さずに列を切り替えられる。

```tsx
const queryClient = useQueryClient()

function handleKanbanMove(id: string, newStatus: number) {
  const previous = queryClient.getQueryData<DVRecord[]>(["requests"])
  queryClient.setQueryData<DVRecord[]>(["requests"], (old) =>
    (old ?? []).map((r) => (String(r[f.id]) === id ? { ...r, [f.status]: newStatus } : r)),
  )
  updateM.mutate({ id, data: { [f.status]: newStatus } }, {
    onSuccess: () => toast.success("ステータスを更新しました"),
    onError: () => {
      queryClient.setQueryData(["requests"], previous) // ロールバック
      toast.error("更新に失敗しました")
    },
  })
}
```

## パターン 1: ガントチャート（カスタムノードで時間軸配置）

行 = カテゴリ（工場・担当者等）、列 = 時間軸。ノードをバー状にカスタム描画し、`position.x` を日数×px、
`position.y` をレーン番号×行高で計算する。**バーの幅・高さは `data` ではなく Node 本体の `width`/`height`
に設定する**（`NodeResizeControl` によるドラッグ拡縮を有効にする場合、内部で Node の寸法を直接書き換える
ため、`data` 内に固定 px 幅を持たせると表示とズレる）。

`categoryColor()`（[色相ハッシュユーティリティ](component-catalog.md)相当）のパレットは、黒・グレーのような
低彩度色を含めず、彩度・明度を揃えた識別しやすい色のみで構成する。進捗フィルは半透明の重ね塗りにせず
**単色でくっきり**塗り、ラベルは半透明チップに乗せて背景色に関わらず可読性を確保する。

```tsx
// src/lib/category-color.ts
export const PALETTE = ["#e60012", "#2563eb", "#f59e0b", "#16a34a", "#8b5cf6", "#0ea5e9", "#db2777", "#ea580c"]

export function categoryColor(category: string): string {
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
```

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

## パターン 3: キャパシティ／負荷ボード（期間ビュー切替・積み上げ）

「各期間に積まれたオーダー（負荷）と、その上にどれだけキャパが残っているか」を時間軸で見せる
積み上げ棒ボード。ReactFlow/dnd-kit は使わず、**純 CSS（絶対配置 + flex）** で描く軽量パターン。
工場・担当者などの単位でカードを分け、横軸に期間バケットを並べる。

**要件の勘所**:

- 棒は下から「オーダー（負荷）」を数量比で積み上げ、上端側に「残キャパ」を淡色で乗せる。
- **キャパ基準線**（破線）をキャパ量の位置に引き、負荷が超えたら線を警告色にして超過分（`+N`）を上に出す。
- 棒高さは全バケットの `max(capacity, load)` で正規化し、**上端に 15% の余白**を残す（基準線・超過が
  上辺に張り付かない）。
- 期間ビュー（週間=日／1か月=日／半年=週／年間=月）をボタンで切り替え、`< >` で前後の期間へ移動。
  初期表示は「今日を含む期間」にスナップし、**今日の列を左端へ自動スクロール**して枠でハイライトする。

### 期間ビューの日付ユーティリティ（丸め・移動）

```tsx
const DAY_MS = 86400000
type CapView = "week" | "month" | "half" | "year"

const atMidnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfWeek = (d: Date) => { const x = atMidnight(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x } // 月曜始まり

// ビュー選択時に期間境界へ丸める（週→月曜 / 月→1日 / 半年→上期・下期先頭 / 年→1/1）
function snapAnchor(view: CapView, d: Date): Date {
  if (view === "week") return startOfWeek(d)
  if (view === "month") return new Date(d.getFullYear(), d.getMonth(), 1)
  if (view === "half") return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1)
  return new Date(d.getFullYear(), 0, 1)
}
// < > で 1 期間ぶん移動する
function shiftAnchor(view: CapView, d: Date, dir: number): Date {
  if (view === "week") return new Date(d.getTime() + dir * 7 * DAY_MS)
  if (view === "month") return new Date(d.getFullYear(), d.getMonth() + dir, 1)
  if (view === "half") return new Date(d.getFullYear(), d.getMonth() + dir * 6, 1)
  return new Date(d.getFullYear() + dir, 0, 1)
}
```

### バケット集計（負荷は日産×重なり日数で按分）

計画（オーダー）は期間をまたぐので、**総数量ではなく日産レート（数量 ÷ 計画日数）× バケット内の
重なり日数**で各バケットへ按分する。キャパは日次キャパを期間ぶん合算する。こうすると日/週/月の
どの粒度でも「負荷 vs キャパ」の単位が揃う。

```tsx
// バケット [bs, be) 内の 1 オーダー寄与 = 日産レート × 重なり日数
const os = Math.max(plan.start, bs), oe = Math.min(plan.end, be)
const contribution = oe > os ? plan.dailyRate * Math.round((oe - os) / DAY_MS) : 0
const load = orders.reduce((s, o) => s + o.qty, 0)
const remaining = Math.max(0, capacity - load)
const overload  = Math.max(0, load - capacity)
```

### 描画（積み上げ棒 + 基準線 + 今日ハイライト）

```tsx
const H = 220
const scale = (H * 0.85) / maxTotal   // 上端に余白を残す（基準線が上辺に張り付かない）
const total = Math.max(cell.capacity, cell.load)

<div className={cn("relative rounded-sm border bg-muted/20", cell.containsToday && "ring-2 ring-primary ring-offset-1")}
     style={{ height: H, width: barW }} data-cap-today={cell.containsToday ? "" : undefined}>
  {/* 下からオーダー、上に残キャパ */}
  <div className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-sm" style={{ height: total * scale }}>
    {cell.remaining > 0 && <div style={{ height: cell.remaining * scale, backgroundColor: `${accent}22` }} />}
    {cell.orders.map((o, i) => (
      <div key={o.id} className="border-t border-white/40"
           style={{ height: Math.max(1, o.qty * scale), backgroundColor: PALETTE[i % PALETTE.length] }} />
    ))}
  </div>
  {/* キャパ基準線（超過は警告色） */}
  {cell.capacity > 0 && (
    <div className="absolute inset-x-0 border-t border-dashed"
         style={{ bottom: cell.capacity * scale, borderColor: cell.overload > 0 ? "#e60012" : accent }} />
  )}
</div>
```

初期表示で今日の列を左端へ寄せるのは、`data-cap-today` を目印にした `useEffect` で十分（ライブラリ不要）:

```tsx
useEffect(() => {
  root.querySelectorAll<HTMLElement>("[data-cap-scroll]").forEach((sc) => {
    const today = sc.querySelector<HTMLElement>("[data-cap-today]")
    sc.scrollLeft = today ? Math.max(0, today.offsetLeft - 8) : 0
  })
}, [capView, capAnchor])
```

> ビュー切替は `Select` ではなく**セグメントボタン**（選択中は塗り、他は `ghost`）にすると 1 タップで
> 切り替えられて操作が速い。期間ラベル（例:「2026年 上期（1-6月）」）は `< >` ボタンの間に置き、
> 「今日」ボタンで現在期間へジャンプできるようにする。バーのクリックは、そのバケットを覆う
> キャパレコードの編集モーダルを開く導線にすると閲覧と編集がつながる。

## カテゴリ色は 1 箇所に集約する（Recharts と共用）

`categoryColor()`／`PALETTE` は「パターン 1」で定義した `src/lib/category-color.ts` の**1 箇所のみ**に置き、
ページごとに `PIE_COLORS` のような色配列を複製しない。複製すると、後で低彩度色（黒・グレー）を除去する
修正をしても複製先に反映されず、画面によって視認性の悪い配色が残る（実際に Recharts の `Pie`/`Bar` の
`Cell` 色配列が `category-color.ts` と別に定義され、黒・グレーが再混入した事例がある）。

- **件数・比率の内訳など、系列数が固定で少数（5 以下）** → `color-palettes.md` のテーマ変数
  `var(--chart-1)`〜`var(--chart-5)` を使う（ライト/ダークやカラーパレット切替に自動追従する）。
- **商品カテゴリ・工場名など、値の種類が可変・自由入力** → `categoryColor()` のハッシュ結果を使う
  （`PALETTE` は黒・グレーを含めない。`export const PALETTE` にして `Cell fill={PALETTE[i % PALETTE.length]}`
  のように Recharts からもインポートして再利用する）。

## 操作性の標準設定

- `nodesDraggable={false}` / `nodesConnectable={false}`: 可視化専用（編集不可）にする場合はノード操作を無効化
- `panOnScroll` + `zoomOnScroll={false}`: 縦横スクロールと拡大縮小の誤操作を防ぐ（ガントチャートで横スクロール優先時）
- 凡例（カテゴリ色チップ）は ReactFlow の外側に通常の React（`<div>` + `<Badge>`）で表示する
- フィルター（工場・カテゴリ・検索）は既存 CRUD 画面と同じ `Select` / `Input` パターンに合わせる

## パターン 4: 組織図 × 予算達成状況（OrgChart）

Office 365 Users API（`Office365UsersModel`）で取得した組織ツリーと、Dataverse の売上実績・目標を
カスタムノードに統合表示するパターン。各メンバーのカードに達成率プログレスバーを直接描画し、
クリックで右サイドパネルに詳細を表示する。

### いつ使うか

- 上司→部下の階層と KPI（目標/実績/パイプライン）を 1 画面で俯瞰したい
- 組織横断で達成率の高低を色分けして視覚的に把握したい

### カスタムノード

```tsx
// src/components/org-chart-node.tsx
import { Handle, Position, type NodeTypes } from "@xyflow/react"
import { User, TrendingUp } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface OrgNodeData {
  displayName: string
  jobTitle?: string
  department?: string
  targetAmount: number
  actualAmount: number
  pipelineAmount: number
  rate: number
  isMe?: boolean
  [key: string]: unknown
}

function OrgChartNode({ data, selected }: { data: OrgNodeData; selected?: boolean }) {
  const rateColor = data.rate >= 100 ? "#10b981" : data.rate >= 70 ? "#f59e0b" : "#ef4444"
  const rateColorClass = data.rate >= 100 ? "text-green-600" : data.rate >= 70 ? "text-amber-600" : "text-red-600"

  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] max-w-[220px] shadow-sm transition-all cursor-pointer bg-card
      ${selected ? "ring-2 ring-primary ring-offset-2" : "hover:shadow-md"}
      ${data.isMe ? "border-primary" : "border-muted-foreground/30"}`}>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="flex items-center gap-2 mb-1">
        <div className={`flex items-center justify-center h-7 w-7 rounded-full ${data.isMe ? "bg-primary/20" : "bg-muted"}`}>
          <User className={`h-3.5 w-3.5 ${data.isMe ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{data.displayName}</p>
          {data.jobTitle && <p className="text-[10px] text-muted-foreground truncate">{data.jobTitle}</p>}
        </div>
      </div>
      {data.department && <p className="text-[10px] text-muted-foreground mb-2">{data.department}</p>}

      {data.targetAmount > 0 ? (
        <>
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className="text-muted-foreground">目標</span>
            <span className="font-medium">{formatCurrency(data.targetAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-muted-foreground">実績</span>
            <span className="font-semibold text-green-600">{formatCurrency(data.actualAmount)}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 mb-1">
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(data.rate, 100)}%`, backgroundColor: rateColor }} />
          </div>
          <div className="flex items-center justify-center">
            <span className={`text-xs font-bold ${rateColorClass}`}>
              <TrendingUp className="inline h-3 w-3 mr-0.5" />{data.rate}%
            </span>
          </div>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center py-1">目標未設定</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
}

export const orgNodeTypes: NodeTypes = { orgCard: OrgChartNode }
```

### ツリーレイアウト（手動段組み）

Office 365 Users の `manager.id` を使って親子関係を構築し、再帰的にサブツリー幅を計算して配置する。
自動レイアウトライブラリ不要（サブツリー幅ベースの手動計算で十分）。

```tsx
const nodeW = 200, nodeH = 160, xGap = 30, yGap = 80

// サブツリー幅を再帰計算
function getSubtreeWidth(memberId: string): number {
  const children = childrenMap.get(memberId) ?? []
  if (children.length === 0) return nodeW
  return children.map(c => getSubtreeWidth(c.id)).reduce((sum, w) => sum + w, 0) + (children.length - 1) * xGap
}

// 再帰配置
function layoutNode(member: OrgMember, x: number, y: number) {
  resultNodes.push({
    id: member.id, type: "orgCard",
    position: { x, y },
    data: { displayName: member.displayName, jobTitle: member.jobTitle, ...budget } as OrgNodeData,
  })
  const children = childrenMap.get(member.id) ?? []
  const totalWidth = getSubtreeWidth(member.id)
  let childX = x + nodeW / 2 - totalWidth / 2
  for (const child of children) {
    const childWidth = getSubtreeWidth(child.id)
    resultEdges.push({ id: `e-${member.id}-${child.id}`, source: member.id, target: child.id, style: { stroke: "#94a3b8", strokeWidth: 1.5 } })
    layoutNode(child, childX + childWidth / 2 - nodeW / 2, y + nodeH + yGap)
    childX += childWidth + xGap
  }
}
```

### O365 userId → systemuserid マッピング

組織図ノードに予算実績を紐付けるには、O365 Users の `mail` と `systemuser` テーブルの `internalemailaddress`
をメールアドレスで突合する（大文字小文字を正規化して比較）。

```tsx
const o365ToSystemUser = useMemo(() => {
  const map = new Map<string, string>()
  for (const member of orgMembers) {
    if (!member.mail) continue
    const su = systemUsers.find(u => u.internalemailaddress?.toLowerCase() === member.mail!.toLowerCase())
    if (su) map.set(member.id, su.systemuserid)
  }
  return map
}, [orgMembers, systemUsers])
```

### 詳細パネル

ノードクリックで右から 340px のサイドパネルをスライド表示。`absolute right-0 top-0 bottom-0` + `z-50` で
ReactFlow のキャンバス上に重ねる。年間目標・受注実績・達成率・見込み達成率・パイプラインを
`grid grid-cols-2` のカードで表示する。

### ReactFlow 設定

```tsx
<ReactFlow
  nodes={nodes} edges={edges}
  onNodeClick={onNodeClick}
  nodeTypes={orgNodeTypes}
  fitView fitViewOptions={{ padding: 0.2 }}
  proOptions={{ hideAttribution: true }}
  nodesDraggable={false} nodesConnectable={false}
  elementsSelectable panOnDrag zoomOnScroll
/>
```

### KPI サマリー行

ReactFlow の上に組織全体の KPI カード（目標合計・実績合計・達成率・パイプライン）を
`grid grid-cols-2 sm:grid-cols-4 gap-3` で配置する。達成率の色は 100% 以上=緑、70% 以上=黄、それ以下=赤。

---

## パターン 5: セールスパイプライン（リード → 商談フロー可視化）

リードのステータス遷移（新規→連絡済→認定済→変換済 / 不認定）と、商談のステージ遷移（見込み→提案→交渉→受注/失注）を
**2 段の水平フロー + 分岐**として 1 画面に可視化するパターン。各ノードに件数・金額・CVR を表示し、
クリックで該当レコード一覧をサイドパネルに表示する。

### いつ使うか

- 営業パイプライン全体（リード育成〜受注）を俯瞰したい
- どのステージにボトルネックがあるか可視化したい
- フィルタ（リードソース・キャンペーン・会計期間）で切り口を変えたい

### カスタムノード群

```tsx
// パイプラインノード（件数・金額・CVR を表示）
interface PipelineNodeData {
  label: string; count: number; amount: number
  color: string; category: string; conversionRate?: string
  [key: string]: unknown
}

function PipelineNode({ data, selected }: { data: PipelineNodeData; selected?: boolean }) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[140px] text-center shadow-sm transition-all cursor-pointer
      ${selected ? "ring-2 ring-primary ring-offset-2" : "hover:shadow-md"}`}
      style={{ borderColor: data.color, background: `color-mix(in srgb, ${data.color} 6%, var(--color-card))` }}>
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0" />
      <p className="text-[10px] font-medium text-muted-foreground">{data.category}</p>
      <p className="text-sm font-bold" style={{ color: data.color }}>{data.label}</p>
      <p className="text-2xl font-bold mt-0.5">{data.count}<span className="text-xs font-normal ml-1">件</span></p>
      <p className="text-xs text-muted-foreground">{formatCurrency(data.amount)}</p>
      {data.conversionRate && <p className="text-[10px] font-medium mt-0.5" style={{ color: data.color }}>{data.conversionRate}</p>}
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0" />
    </div>
  )
}

// 補助ノード: 水平区切り線・垂直区切り線・ゾーンラベル
function DividerNode() {
  return <div className="w-[1500px] border-t border-dashed border-muted-foreground/30" />
}
function VerticalDividerNode({ data }: { data: { height: number } }) {
  return <div className="border-l border-dashed border-muted-foreground/30" style={{ height: data.height }} />
}
function ZoneLabelNode({ data }: { data: { label: string; colorClass: string } }) {
  return (
    <div className={`flex items-center justify-center px-3 py-1.5 rounded-md text-center ${data.colorClass}`}>
      <span className="text-[11px] font-bold leading-tight whitespace-pre-line">{data.label}</span>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode, divider: DividerNode,
  verticalDivider: VerticalDividerNode, zoneLabel: ZoneLabelNode,
}
```

### レイアウト設計（2 段 + 分岐）

```
┌─────────────────────────────────────────────────────────────────────┐
│ リード  │ [新規] → [連絡済] → [認定済] → [変換済(CVR)]              │
│ 育成    │                        ↓                                  │
│ 選別    │                    [不認定]                                │
├─────────┼──── 水平区切り線 ─────────────────────────────────────────┤
│ 商談    │              [見込み] → [提案] → [交渉] → [受注]          │
│ 管理    │                                     ↘  → [失注]          │
└─────────────────────────────────────────────────────────────────────┘
  左ラベル列 ←→ ノード配置領域（垂直区切り線で分離）
```

**レイアウト数値（ノード重なり防止）**:

```tsx
const nodeH = 110, xSpacing = 200
const labelColW = 130              // 左ラベル列幅
const nodeStartX = labelColW + 20  // ノード描画開始 X
const row1Y = 20                   // リード行 Y
const disqualifiedY = row1Y + nodeH + 20  // 不認定ノード Y
const dividerY = disqualifiedY + nodeH + 30 // 水平区切り線 Y
const row2Y = dividerY + 80       // 商談行 Y
```

### エッジ定義（アニメーション + 分岐）

```tsx
const edges: Edge[] = [
  // リード主フロー（水平・animated）
  { id: "e-l-new-cont", source: "lead-new", target: "lead-contacted", animated: true, style: { stroke: "#94a3b8" } },
  // 不認定分岐（縦・赤破線）sourceHandle="bottom" → targetHandle="top"
  { id: "e-l-qual-disq", source: "lead-qualified", sourceHandle: "bottom",
    target: "lead-disqualified", targetHandle: "top",
    animated: true, style: { stroke: "#ef4444", strokeDasharray: "5 5" } },
  // 変換→見込み（リード→商談の遷移、太線・強調色）
  { id: "e-conv-prospect", source: "lead-converted", sourceHandle: "bottom",
    target: "opp-prospect", targetHandle: "top",
    animated: true, style: { stroke: "#6366f1", strokeWidth: 2 } },
  // 受注/失注分岐（交渉から 2 方向）
  { id: "e-nego-won", source: "opp-negotiation", target: "opp-won",
    animated: true, style: { stroke: "#10b981", strokeWidth: 2 } },
  { id: "e-nego-lost", source: "opp-negotiation", target: "opp-lost",
    animated: true, style: { stroke: "#ef4444", strokeDasharray: "5 5" } },
]
```

### クリック → サイドパネル

ノード ID（`lead-{status}` / `opp-{stage}`）からステータス値をパースし、該当レコードをフィルタしてサイドパネルに表示。
パネル内の各レコードカードをクリックすると詳細画面（`/leads/{id}` / `/opportunities/{id}`）へ遷移する。

### フィルタ連携

パイプライン上部に `Select` コンポーネントでフィルタを配置:
- **リードソース**: `geek_source`（OptionSet）でリードをフィルタ → 変換済リードに紐付く商談のみ表示
- **キャンペーン**: `_geek_campaignid_value` でリード/商談を絞り込み
- **会計期間**: `geek_crmfiscalperiods` の start/end で日付範囲フィルタ

フィルタが「リード側」に適用される場合、商談側は「フィルタ条件に合致するリードから変換された商談」のみ表示する
（`leads.filter(l => l.geek_status === Converted).map(l => l._geek_convertedopportunityid_value)` で ID セットを作り、
商談をフィルタ）。

### Tabs でパイプライン/組織図を切り替え

ダッシュボードページ内で `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` を使い、
「パイプライン」タブと「組織図」タブを切り替える構成が有効。両方とも ReactFlow ベースだが、
別のカスタムノードセット（`nodeTypes`）を使う。
