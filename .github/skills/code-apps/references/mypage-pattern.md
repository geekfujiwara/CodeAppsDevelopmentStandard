# マイページ（パーソナルダッシュボード）デザインパターン

ログインユーザーの担当データに絞ったパーソナルビューと、組織全体の概況を切り替えるダッシュボードの実装パターン。

---

## レイアウト

```
┌──────────────────────────────────────────────────┐
│  [マイページ] [全体概況]   タブ切替               │
├──────────────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐   KPIカード 4枚    │
│  │ 12 │ │  5 │ │  3 │ │  8 │                    │
│  └────┘ └────┘ └────┘ └────┘                    │
├────────────────┬─────────────────────────────────┤
│  自分のWO一覧  │  自分のコール一覧               │
│  CompactTable  │  CompactTable                   │
├────────────────┼─────────────────────────────────┤
│  未アサインコール │  未アサインWO                 │
├────────────────┴─────────────────────────────────┤
│  チーム実績(棒)  │  SLA分布(円)  │ 顧客別(棒)    │
└──────────────────────────────────────────────────┘
```

## ユーザー識別 → エンジニア紐付け

### currentUserId の取得

`useCurrentUserId()` フックで `systemuser.azureactivedirectoryobjectid` を取得:

```typescript
const currentUserId = useCurrentUserId()
```

### エンジニアレコードの照合

```typescript
const myEngineer = useMemo(() =>
  engineers.find(e =>
    String(e[`_${PUBLISHER_PREFIX}_userid_value`] ?? "")
      .toLowerCase() === currentUserId?.toLowerCase()
  ),
  [engineers, currentUserId]
)
```

### 未紐付け時のフォールバック

```tsx
if (!myEngineer) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm text-muted-foreground">
          エンジニアレコードが見つかりません
        </p>
        <p className="text-xs text-muted-foreground">
          管理者に連絡してください
        </p>
      </CardContent>
    </Card>
  )
}
```

## リレーショナルフィルターチェーン

WO → コール → 顧客の連鎖的なスコープ絞り込み:

```typescript
// 自分の WO
const myWorkOrders = useMemo(() =>
  workOrders.filter(w =>
    String(w[`_${PUBLISHER_PREFIX}_engineerid_value`] ?? "")
      .toLowerCase() === myEngineerId.toLowerCase()
  ), [workOrders, myEngineerId]
)

// 自分の WO に紐づくコール
const myCallIds = useMemo(() =>
  new Set(myWorkOrders
    .map(w => String(w[`_${PUBLISHER_PREFIX}_callid_value`] ?? ""))
    .filter(Boolean)
  ), [myWorkOrders]
)

const myCalls = useMemo(() =>
  calls.filter(c => myCallIds.has(String(c[`${PUBLISHER_PREFIX}_callid`] ?? "")))
, [calls, myCallIds])
```

## 未アサインプール（アラートパターン）

```typescript
// WO 未割当てのコール（受付済 or 対応中のみ）
const unassignedCalls = useMemo(() =>
  calls.filter(c => {
    const id = String(c[`${PUBLISHER_PREFIX}_callid`] ?? "")
    const status = c[`${PUBLISHER_PREFIX}_status`] as number
    return !assignedCallIds.has(id) &&
      (status === CALL_STATUS.RECEIVED || status === CALL_STATUS.IN_PROGRESS)
  }), [calls, assignedCallIds]
)

// エンジニア未割当ての WO
const unassignedWorkOrders = useMemo(() =>
  workOrders.filter(w => !w[`_${PUBLISHER_PREFIX}_engineerid_value`])
, [workOrders])
```

## KPI カードコンポーネント

```tsx
function KpiCard({ title, value, icon: Icon, color, subtitle }: {
  title: string; value: number; icon: LucideIcon
  color: string; subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

## CompactTable（スクロール可能な簡易テーブル）

```tsx
type ColDef = {
  key: string
  label: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

function CompactTable({ rows, columns, emptyMessage }: {
  rows: Record<string, unknown>[]
  columns: ColDef[]
  emptyMessage: string
}) {
  return (
    <div className="max-h-[320px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col.key} className="text-xs">{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-xs text-muted-foreground py-4">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map(col => (
                <TableCell key={col.key} className="text-xs py-1.5">
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

## Recharts 集計チャート

### 棒グラフ（チーム実績）

```tsx
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={teamPerformanceData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
    <YAxis allowDecimals={false} />
    <RechartsTooltip />
    <Legend />
    <Bar dataKey="completed" name="完了" fill="#22c55e" stackId="a" />
    <Bar dataKey="working" name="作業中" fill="#3b82f6" stackId="a" />
  </BarChart>
</ResponsiveContainer>
```

### 円グラフ（SLA 分布）

```tsx
const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"]

<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie data={tierData} dataKey="value" nameKey="name"
      cx="50%" cy="50%" outerRadius={100} label>
      {tierData.map((_, i) => (
        <Cell key={i} fill={COLORS[i % COLORS.length]} />
      ))}
    </Pie>
    <RechartsTooltip />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

## ナレッジ登録モーダル

マイページからナレッジ（改善提案）を直接登録:

```typescript
const handleCreateSave = async () => {
  if (!formData.name.trim()) { toast.error("タイトルは必須です"); return }
  const data: Record<string, unknown> = {
    [`${PUBLISHER_PREFIX}_name`]: formData.name,
    [`${PUBLISHER_PREFIX}_category`]: Number(formData.category),
    [`${PUBLISHER_PREFIX}_detail`]: formData.detail,
    // Dataverse リレーション（odata.bind）
    [`${PUBLISHER_PREFIX}_customerid@odata.bind`]:
      `/${PUBLISHER_PREFIX}_customers(${formData.customer_id})`,
  }
  await createRecommendation.mutateAsync(data)
  toast.success("ナレッジを登録しました")
}
```
