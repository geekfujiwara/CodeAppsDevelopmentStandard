# サービスフロー デザインパターン

業務フローの全体像を可視化する ReactFlow ベースのフロー図 + ステータス集計カードの実装パターン。

---

## レイアウト

```
┌──────────────────────────────────────────────────┐
│  タイトル / サブタイトル                          │
├──────────────────────────────────────────────────┤
│         [コール] ──→ [作業オーダー] ──→ [日報]    │
│         ReactFlow ネットワーク図                  │
├────────────┬────────────┬────────────────────────┤
│  コール    │  WO 種別   │  日報 承認状況          │
│  ステータス│  件数集計  │  件数集計               │
└────────────┴────────────┴────────────────────────┘
```

## 必須依存ライブラリ

```bash
npm install @xyflow/react
```

## ReactFlow カスタムノード

各ノードをカスタムコンポーネントで定義し、集計データを表示:

```typescript
function SourceNode({ data }: NodeProps) {
  const d = data as {
    label: string; count: number; total: number;
    color: string; items: { label: string; count: number; color: string }[]
  }
  return (
    <div className="bg-card border rounded-lg p-4 min-w-[200px]
      hover:border-primary/50 hover:shadow-md transition-all">
      <Handle type="source" position={Position.Right} className="!bg-primary" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${d.color}`} />
        <span className="font-semibold text-sm">{d.label}</span>
        <span className="ml-auto text-lg font-bold">{d.total}</span>
      </div>
      <div className="space-y-1">
        {d.items.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${item.color}`} />
            <span className="flex-1">{item.label}</span>
            <span className="font-medium">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

ノード種別:
- `SourceNode`: 起点（Handle: source のみ）
- `CenterNode`: 中間（Handle: source + target）
- `EndNode`: 終点（Handle: target のみ）

## Map ベース集計パターン

Dataverse から取得した配列をステータス/種別ごとにカウント:

```typescript
const callByStatus = useMemo(() => {
  const m = new Map<number, number>()
  calls.forEach(c => {
    const s = Number(c[`${PUBLISHER_PREFIX}_status`] ?? 0)
    m.set(s, (m.get(s) ?? 0) + 1)
  })
  return m
}, [calls])
```

## ノードクリックによるページ遷移

```typescript
const NODE_ROUTES: Record<string, string> = {
  call: "/calls",
  wo: "/work-orders",
  daily: "/daily-reports",
}

const onNodeClick = useCallback((_: unknown, node: Node) => {
  const route = NODE_ROUTES[node.id]
  if (route) navigate(route)
}, [navigate])
```

## エッジ定義（アニメーション付き）

```typescript
const edges: Edge[] = [
  {
    id: "call-wo",
    source: "call",
    target: "wo",
    animated: true,
    label: String(woFromCallCount),
    style: { strokeWidth: 2 },
    labelStyle: { fontWeight: 700 },
  },
]
```

## 関連データのカウント（WO → コール紐付き率）

```typescript
const woFromCall = workOrders.filter(
  wo => !!wo[`_${PUBLISHER_PREFIX}_callid_value`]
).length

const woWithoutCall = workOrders.length - woFromCall
```
