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

## パターン 1: ガントチャート（カスタムノードで時間軸配置）

行 = カテゴリ（工場・担当者等）、列 = 時間軸。ノードをバー状にカスタム描画し、`position.x` を日数×px、
`position.y` をレーン番号×行高で計算する。

```tsx
// src/components/gantt/gantt-bar-node.tsx
import { Handle, Position, type NodeProps } from "@xyflow/react"

export type GanttBarData = {
  label: string
  subLabel?: string
  progress: number       // 0-100
  color: string          // カテゴリ色（hex）
  widthPx: number
}

export function GanttBarNode({ data }: NodeProps<{ data: GanttBarData }>) {
  const d = data as unknown as GanttBarData
  return (
    <div
      style={{ width: d.widthPx, backgroundColor: `${d.color}33`, borderColor: d.color }}
      className="h-8 rounded-md border-2 relative overflow-hidden text-xs flex items-center px-2"
      title={`${d.label} ${d.progress}%`}
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${d.progress}%`, backgroundColor: d.color, opacity: 0.5 }}
      />
      <span className="relative truncate font-medium">{d.label}</span>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
}
```

```tsx
// ページ側: 日付→x座標変換、レーン割当、ノード生成
const DAY_PX = 12
const ROW_H = 44

function toX(date: Date, origin: Date) {
  return Math.round((date.getTime() - origin.getTime()) / 86400000) * DAY_PX
}

const nodes = useMemo(() => {
  return plans.map((p, i) => ({
    id: p.id,
    type: "ganttBar",
    position: { x: toX(new Date(p.start), origin), y: laneIndex.get(p.laneKey)! * ROW_H },
    data: {
      label: p.name, progress: p.progress,
      color: categoryColor(p.category),
      widthPx: Math.max(DAY_PX * p.durationDays, DAY_PX * 7),
    },
    draggable: false,
  }))
}, [plans, origin, laneIndex])

<ReactFlow
  nodes={nodes}
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
パン・ズームに追従する。

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

## カテゴリ色のハッシュ関数（自由入力カテゴリを一貫した色にマッピング）

```typescript
// src/lib/category-color.ts
const PALETTE = ["#e60012", "#111111", "#f59e0b", "#22c55e", "#6b7280", "#8b5cf6", "#0ea5e9", "#db2777"]

export function categoryColor(category: string): string {
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
```

`--chart-1`〜`--chart-5`（テーマ変数）を優先して使う場合は `PALETTE` をそれらの実色値に差し替える。

## 操作性の標準設定

- `nodesDraggable={false}` / `nodesConnectable={false}`: 可視化専用（編集不可）にする場合はノード操作を無効化
- `panOnScroll` + `zoomOnScroll={false}`: 縦横スクロールと拡大縮小の誤操作を防ぐ（ガントチャートで横スクロール優先時）
- 凡例（カテゴリ色チップ）は ReactFlow の外側に通常の React（`<div>` + `<Badge>`）で表示する
- フィルター（工場・カテゴリ・検索）は既存 CRUD 画面と同じ `Select` / `Input` パターンに合わせる
