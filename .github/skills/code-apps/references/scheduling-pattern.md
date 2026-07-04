# スケジューリングボード デザインパターン

ドラッグ&ドロップで作業オーダーをエンジニアのタイムスロットに割り当てるスケジューリングボードの実装パターン。

---

## レイアウト: 3ペイン構成

```
┌─────────────┬──────────────────────────────────────┐
│ 未アサイン  │  ガント / マップ ビュー切替          │
│ (折畳可能)  │                                      │
│             │  [エンジニア名] [8:00][9:00]...[17:00]│
│ エリア絞込  │  ┌──🚗──┬─────WO─────┐              │
│             │  └──────┴────────────┘              │
│ WOカード    │                                      │
│ WOカード    │                                      │
└─────────────┴──────────────────────────────────────┘
```

- **左パネル**: 未アサインWOプール。エリアフィルター付き（折畳み可能）
- **中央**: ガントビュー（日/週切替）またはマップビュー
- **ヘッダー**: グループ切替（エリア別/スキル別/全員）、ステータス凡例

## 必須依存ライブラリ

```bash
npm install @dnd-kit/core date-fns
```

## @dnd-kit/core によるドラッグ&ドロップ

### PointerSensor（5px 閾値）

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
)
```

### ドロップターゲット: 30分単位のタイムスロット

```typescript
function HalfHourSlot({ engineerId, hour, half }: {
  engineerId: string; hour: number; half: 0 | 1
}) {
  const slotHour = hour + half * 0.5
  const id = `${engineerId}__${slotHour}`
  const { isOver, setNodeRef } = useDroppable({
    id, data: { engineerId, hour: slotHour }
  })
  return (
    <div ref={setNodeRef} className={cn(
      "h-full min-h-[40px]",
      half === 0 && "border-l border-border/50",
      half === 1 && "border-l border-dashed border-border/30",
      isOver && "bg-primary/10 ring-1 ring-primary/30"
    )} />
  )
}
```

### DragEnd → ルート確認モーダル → Dataverse 更新

```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event
  if (!over) return
  const wo = (active.data.current as { wo: Record<string, unknown> }).wo
  const dropData = over.data.current as { engineerId: string; hour: number }

  // 前の作業場所 or エンジニアのエリア駅を出発地に
  const prevWO = findPreviousWO(dropData.engineerId, dropData.hour)
  const origin = prevWO
    ? String(prevWO[f.installationlocation] ?? "")
    : `${rawArea.replace(/エリア$|サービスセンター$/g, "")}駅`

  // ルート確認モーダルを開く
  setRouteOrigin(origin)
  setRouteDestination(String(wo[f.installationlocation] ?? ""))
  setPendingDrop({ woId, engineerId, hour: dropData.hour })
  setRouteModalOpen(true)
}
```

### Dataverse 保存データ

```typescript
const data: Record<string, unknown> = {
  [`${P}_engineerid@odata.bind`]: `/${P}_engineers(${engineerId})`,
  [f.scheduleddate]: scheduledDate.toISOString(),
  [f.workstart]: scheduledDate.toISOString(),
  [f.status]: 100000001,    // 手配済
  [f.traveltime]: Number(travelMinutes),
  [f.worktime]: Number(workMinutes),
}
await updateWO.mutateAsync({ id: woId, data })
```

## 比例ガントチャート

### カード幅 = 作業時間に比例

```typescript
const startOffset = ((startHour - HOURS[0]) / HOURS.length) * 100 // %
const workWidth  = (workDuration / 60 / HOURS.length) * 100       // %
const travelWidth = (travelDuration / 60 / HOURS.length) * 100    // %
```

### 移動 + 作業の結合レンダリング

```tsx
<div className="absolute flex z-[1]"
  style={{
    left: `${travelOffset >= 0 ? travelOffset : startOffset}%`,
    width: `${travelWidth + workWidth}%`,
    height: `${CARD_H}px`,
    top: `${top}px`
  }}>
  {/* 移動ブロック（グレー） */}
  {travelDuration > 0 && (
    <div style={{ width: `${(travelWidth / (travelWidth + workWidth)) * 100}%` }}>
      🚗
    </div>
  )}
  {/* 作業カード（ステータス色） */}
  <div style={{ width: remainingPercent }}>
    <DraggableWO wo={wo} compact />
  </div>
</div>
```

## 重複検出 & マルチロウ表示

時間が被るカードを自動的に別行に配置し、警告バッジを表示する。

```typescript
// 1. 開始時刻でソート
const sorted = [...dayWOs].sort((a, b) => a.totalStart - b.totalStart)
const rows: number[] = new Array(sorted.length).fill(0)
const overlaps = new Set<number>()

// 2. O(n²) で重なりを検出、行番号を割り当て
for (let i = 0; i < sorted.length; i++) {
  for (let j = 0; j < i; j++) {
    if (sorted[j].totalEnd > sorted[i].totalStart) {
      overlaps.add(i); overlaps.add(j)
      if (rows[i] <= rows[j]) rows[i] = rows[j] + 1
    }
  }
}

// 3. コンテナ高さを動的に計算
const maxRow = rows.length > 0 ? Math.max(...rows) : 0
const containerH = Math.max(40, (maxRow + 1) * (CARD_H + GAP) + 4)
```

重複カードには赤い `!` バッジを表示:

```tsx
{isOverlap && (
  <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full
    w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold z-10"
    title="時間が重複しています">!</span>
)}
```

## ステータスによるカード背景色

Badge ではなくカード自体の背景色でステータスを表現。`STATUS_CARD_BG` を定義:

```typescript
const STATUS_CARD_BG: Record<number, string> = {
  100000000: "bg-gray-50 border-gray-300 ...",     // 未着手
  100000001: "bg-sky-50 border-sky-300 ...",        // 手配済
  100000002: "bg-amber-50 border-amber-400 ...",    // 作業中
  100000003: "bg-green-50 border-green-300 ...",    // 完了
}
```

## Tooltip でカード情報を表示

カードが小さい場合、ホバーで詳細を表示:

```tsx
<TooltipProvider delayDuration={200}>
  <Tooltip>
    <TooltipTrigger asChild>
      <div className={cn("border rounded ...", cardBg)}>
        <Badge label={typeLabel} color={typeColor} />
        <span className="truncate">{woName}</span>
      </div>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-64 whitespace-pre-line text-xs">
      {tooltipText}
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## 週表示: 件数バッジ + 日表示へのドリルダウン

週表示では個別カードの代わりに件数を表示。クリックで日表示に切替:

```tsx
<button className={cn("w-8 h-8 rounded-full ...",
  count >= 4 ? "bg-red-100 text-red-700" :
  count >= 2 ? "bg-amber-100 text-amber-700" :
  "bg-blue-100 text-blue-700"
)} onClick={() => {
  if (count === 1) { openDetail(dayWOs[0]) }
  else { setCurrentDate(day); setViewMode("day") }
}}>
  {count}
</button>
```

## エリア正規化

Dataverse のエリア値（"東京エリア", "東京サービスセンター"）を統一:

```typescript
const normalizeArea = (raw: string) => {
  const base = raw.replace(/サービスセンター|SC$|エリア$/g, "").trim()
  return base ? `${base}エリア` : raw
}
```

## デュアルフィルター同期

未アサインパネルとマップビューのエリアフィルターを連動:

```typescript
const handleUnassignedAreaChange = (val: string) => {
  setUnassignedAreaFilter(val)
  setMapAreaFilter(val)  // 双方向同期
}
```

## Google Maps iframe（APIキー不要）

```typescript
// 単一地点ピン表示
`https://www.google.com/maps?q=${encodeURIComponent(address)}&hl=ja&output=embed`

// ルートモーダル（出発→到着）
`https://www.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(dest)}&dirflg=d&hl=ja&output=embed`
```

> CSP 設定: `frame-src` に `https://www.google.com` を追加する必要がある。

## クロスページナビゲーション

スケジューリング → 詳細ページへの遷移と戻り:

```typescript
// 遷移元（スケジューリング）
sessionStorage.setItem("returnToScheduling", "true")
navigate(`/work-orders?select=${woId}`)

// 遷移先（作業オーダー）
const [searchParams, setSearchParams] = useSearchParams()
useEffect(() => {
  const selectId = searchParams.get("select")
  if (selectId && rows.length > 0) {
    const found = rows.find(r => String(r[f.id]) === selectId)
    if (found) { setSelectedItem(found) }
    setSearchParams({}, { replace: true })
  }
}, [rows, searchParams])

// 戻りボタン（レイアウト）
if (sessionStorage.getItem("returnToScheduling")) {
  // フローティングボタンを表示
}
```
