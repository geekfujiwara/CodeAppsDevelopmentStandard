# CRUD UI 標準パターン（一覧クリックで詳細・インライン編集）

すべての CRUD 画面はこのパターンに統一する。**指示がなくても、テーブルごとに「一覧・詳細（インライン編集）・作成・削除」を標準実装すること。**

---

## 原則

1. **一覧は行／カード全体をクリックして詳細を開く**
   - 「目（👁）」アイコンなどの小さな専用ボタンで詳細を開かせない。クリック領域が小さく操作しづらいため。
   - 行 (`<tr>`) やカード (`<Card>`) に `onClick` を付け、`cursor-pointer` とホバー演出（`hover:bg-accent/50` / `hover:shadow-md hover:border-primary/40`）を付与する。

2. **詳細画面の編集はモーダルではなくインライン編集モード**
   - 「編集」ボタンで同一画面・同一ダイアログ内のフィールドを入力欄へ切り替える（`editing` ステート）。
   - 別モーダルを開かない。保存（`保存`）／キャンセル／削除をインラインに置く。
   - 保存後は `editing=false` に戻して表示モードに復帰する。

3. **行内アクション（削除・クイック操作）は必ず `e.stopPropagation()`**
   - 行クリックの詳細遷移と競合させないため、削除ボタン等は `onClick={(e) => { e.stopPropagation(); ... }}`。

4. **作成（新規）だけはモーダル or 専用インラインフォームでよい**
   - 既存レコードの編集はインライン。新規作成は一覧上部のフォーム／ダイアログで可。

5. **削除確認はブラウザの `confirm()` ではなくモーダル（AlertDialog）**
   - ブラウザ標準のポップアップ（`window.confirm` / `alert`）は使わない。アプリのテーマと不一致でデザインが崩れるため。
   - Promise ベースの `useConfirm()` フックで `if (!(await confirm({...}))) return` の形に置き換える。削除は `destructive: true`。

---

## 削除確認モーダル（Promise ベース）

`AlertDialog`（shadcn/radix）をアプリ全体に 1 つ置き、`useConfirm()` で呼び出す。`window.confirm` と同じ「ガード」記法のまま、見た目だけモーダルになる。

`src/providers/confirm-provider.tsx`:

```tsx
import { createContext, useCallback, useContext, useRef, useState } from "react"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ConfirmOptions = {
  title?: string; description?: string
  confirmText?: string; cancelText?: string; destructive?: boolean
}
type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions>({})
  const resolver = useRef<(v: boolean) => void>(() => {})
  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options ?? {}); setOpen(true)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])
  const close = (v: boolean) => { setOpen(false); resolver.current(v) }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) close(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title ?? "確認"}</AlertDialogTitle>
            {opts.description ? <AlertDialogDescription className="whitespace-pre-wrap">{opts.description}</AlertDialogDescription> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{opts.cancelText ?? "キャンセル"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => close(true)}
              className={cn(opts.destructive && buttonVariants({ variant: "destructive" }))}>
              {opts.confirmText ?? "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider")
  return ctx
}
```

`App.tsx` で `RouterProvider` を `ConfirmProvider` で包む（他の Provider より内側、Router より外側）:

```tsx
<QueryProvider>
  <ConfirmProvider>
    <RouterProvider router={router} />
  </ConfirmProvider>
</QueryProvider>
```

各削除ハンドラ:

```tsx
const confirm = useConfirm()

const handleDelete = async (item) => {
  if (!(await confirm({
    title: "削除の確認",
    description: `「${item.name}」を削除しますか？`,
    confirmText: "削除",
    destructive: true,
  }))) return
  await deleteMutation.mutateAsync(item.id)
  toast.success("削除しました")
}
```

---

## テーブル一覧（行クリック）

```tsx
import { useNavigate } from "react-router-dom"
import { Trash2 } from "lucide-react"   // Eye はインポートしない

const navigate = useNavigate()

<tr
  className="border-b hover:bg-accent/50 transition-colors cursor-pointer"
  onClick={() => navigate(`/items/${id}`)}
>
  <td>{item.name}</td>
  {/* ...他カラム... */}
  <td className="text-right">
    <Button
      variant="ghost" size="icon"
      onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
      title="削除"
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  </td>
</tr>
```

## カード一覧（カードクリック）

```tsx
<Card
  className="flex flex-col hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
  onClick={() => setDetailId(item.id)}
>
  <CardContent>
    {/* 表示内容 */}
    {/* クイック操作は stopPropagation */}
    <Button size="sm" variant="outline"
      onClick={(e) => { e.stopPropagation(); handleQuickAction(item) }}>
      操作
    </Button>
  </CardContent>
</Card>
```

> 一覧の `detail` は**スナップショットではなく ID で保持**し、最新クエリ結果から導出する。更新後も詳細が古い値を表示しないため。
> ```tsx
> const [detailId, setDetailId] = useState<string | null>(null)
> const detail = useMemo(() => items.find((i) => i.id === detailId) ?? null, [items, detailId])
> ```

## 詳細のインライン編集

```tsx
const [editing, setEditing] = useState(false)
const [form, setForm] = useState<ItemInput>({})
const setField = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) =>
  setForm((p) => ({ ...p, [k]: v }))

// 対象が切り替わったら編集モードを閉じる
useEffect(() => { setEditing(false) }, [itemId])

const startEdit = () => { setForm({ /* 現在値で初期化 */ }); setEditing(true) }
const handleSave = async () => {
  if (!form.name?.trim()) { toast.error("名称は必須です"); return }
  await onUpdate(itemId, form)
  setEditing(false)
}

return editing ? (
  <div className="space-y-4">
    {/* Input / select / textarea でフィールドを編集 */}
    <div className="flex items-center justify-between">
      <Button variant="ghost" className="text-red-600" onClick={() => onDelete(item)}>
        <Trash2 className="h-4 w-4 mr-2" />削除
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditing(false)}>
          <X className="h-4 w-4 mr-2" />キャンセル
        </Button>
        <Button onClick={handleSave} disabled={!form.name?.trim()}>
          <Save className="h-4 w-4 mr-2" />保存
        </Button>
      </div>
    </div>
  </div>
) : (
  <div className="space-y-5">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={startEdit}>
        <Pencil className="h-4 w-4 mr-2" />編集
      </Button>
    </div>
    {/* 表示内容 */}
  </div>
)
```

## ツリー／階層 UI（組織図など）

- ノード行全体をクリックでインライン編集パネルを行直下に展開する（鉛筆アイコン→モーダルにしない）。
- 展開／折りたたみのシェブロンは `e.stopPropagation()` でクリックを分離する。
- 編集パネル内のクリックは `onClick={(e) => e.stopPropagation()}` で行クリックへ伝播させない。

---

## 一覧の検索・フィルター・重要列（標準）

一覧は単なる名称検索で終わらせず、**「誰のレコードか（所有者）」「金額などの重要数値」を列として表示し、それらで絞り込み・検索できる**ようにする。営業系（リード・商談・活動・キャンペーン等）の一覧はこの構成を標準とする。

### 構成要素

| 要素 | 内容 |
|---|---|
| 検索ボックス | 名称＋関連名（取引先名・会社名・メール等）を横断検索 |
| フィルター（ステータス/ステージ） | OptionSet ラベルから `Select` を生成。`"all"` で全件 |
| フィルター（所有者） | **実データに存在する所有者のみ**列挙（全ユーザーを出さない） |
| 重要列（所有者） | `_owninguser_value` + systemusers Map で名前表示（→ [Lookup 名前解決](lookup-resolution.md)） |
| 重要列（金額） | `formatCurrency`。絞り込み結果の**合計**もツールバーに表示 |
| 件数・合計表示 | `{filtered.length} 件 / 合計 {formatCurrency(total)}` |

### 実装パターン

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const { data: rows = [] } = useOpportunities()
const { data: users = [] } = useSystemUsers()

const [search, setSearch] = useState("")
const [stageFilter, setStageFilter] = useState("all")
const [ownerFilter, setOwnerFilter] = useState("all")

// 所有者名の Map（→ lookup-resolution.md）
const userMap = useMemo(() => {
  const m = new Map<string, string>()
  users.forEach((u) => m.set(u.systemuserid, u.fullname ?? ""))
  return m
}, [users])

// フィルターの所有者候補は「実データに存在する所有者」だけ
const ownerOptions = useMemo(() => {
  const ids = new Set<string>()
  rows.forEach((r) => { if (r._owninguser_value) ids.add(r._owninguser_value) })
  return Array.from(ids).map((id) => ({ id, name: userMap.get(id) ?? id }))
}, [rows, userMap])

// 検索 + フィルターを一度に適用
const filtered = useMemo(() => {
  const s = search.toLowerCase()
  return rows.filter((r) => {
    if (s) {
      const acc = r._{prefix}_accountid_value ? (accountMap.get(r._{prefix}_accountid_value) ?? "").toLowerCase() : ""
      if (!r.{prefix}_name?.toLowerCase().includes(s) && !acc.includes(s)) return false
    }
    if (stageFilter !== "all" && String(r.{prefix}_stage) !== stageFilter) return false
    if (ownerFilter !== "all" && r._owninguser_value !== ownerFilter) return false
    return true
  })
}, [rows, search, stageFilter, ownerFilter, accountMap])

const totalAmount = useMemo(() => filtered.reduce((sum, r) => sum + (r.{prefix}_amount ?? 0), 0), [filtered])
```

ツールバー（検索 + 2 フィルター + 件数/合計）:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <div className="relative w-full max-w-xs">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input placeholder="商談名・取引先で検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
  </div>
  <Select value={stageFilter} onValueChange={setStageFilter}>
    <SelectTrigger className="w-36"><SelectValue placeholder="ステージ" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全ステージ</SelectItem>
      {Object.entries(opportunityStageLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
    </SelectContent>
  </Select>
  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
    <SelectTrigger className="w-44"><SelectValue placeholder="所有者" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全所有者</SelectItem>
      {ownerOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
    </SelectContent>
  </Select>
  <div className="ml-auto text-sm text-muted-foreground">
    {filtered.length} 件 / 合計 <span className="font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
  </div>
</div>
```

> **所有者列を表示するには `$select` に `_owninguser_value` を含めること**（Dataverse のデータ取得 hook 側）。値の解決は [Lookup 名前解決リファレンス](lookup-resolution.md) の「所有者（Owner）列」を参照。
> レスポンシブで列を出し分ける場合は `hidden md:table-cell` / `hidden lg:table-cell` / `hidden xl:table-cell` を使い、重要列（所有者・金額）は早い段階（`md`/`lg`）で表示する。

---

## 詳細ページパターン（フルページ遷移 + RecordListPanel）

詳細画面はモーダルではなく**フルページ遷移**で表示する。一覧からの行クリックで `navigate('/items/${id}')` し、専用の詳細ページコンポーネントへルーティングする。

### レイアウト構成

```
┌─────────────────────────────────────────────────────┐
│ [←] レコード名               [一覧] [編集] [削除]    │
├──────────┬──────────────────────────────────────────┤
│ 一覧パネル │  Card                                    │
│ (トグル)  │  ├ CardHeader: セクションタイトル           │
│          │  └ CardContent: 2カラム grid のフィールド   │
│  ● 現在   │     表示モード: <p> / <Badge>             │
│    他1    │     編集モード: <Input> / <Select>        │
│    他2    │                                          │
│    ...   │                                          │
└──────────┴──────────────────────────────────────────┘
```

### 構成要素

| 要素 | 説明 |
|---|---|
| ヘッダー行 | 戻るボタン（`ArrowLeft`）＋レコード名＋アクションボタン群 |
| `RecordListPanel` | 左サイドに同一種類のレコード一覧を表示。ワンクリックで他レコードへ切替。トグルで表示/非表示 |
| `Card` | フィールドを 2 カラム `grid` で配置。`editing` ステートで表示/入力を切替 |
| アクションボタン | 表示モード: `一覧` `編集` `削除` ／ 編集モード: `保存` `キャンセル` |

### ルーティング

一覧ページと詳細ページを別コンポーネントにし、`react-router-dom` でルーティングする。

```tsx
// router.tsx
const ItemsPage = lazy(() => import("@/pages/items"))
const ItemDetailPage = lazy(() => import("@/pages/item-detail"))

// routes 内
{ path: "items", element: withSuspense(ItemsPage) },
{ path: "items/:id", element: withSuspense(ItemDetailPage) },
```

一覧ページの行クリック:

```tsx
const navigate = useNavigate()

<tr
  className="border-t hover:bg-accent/50 transition-colors cursor-pointer"
  onClick={() => navigate(`/items/${item.id}`)}
>
```

> **一覧ページの新規作成はダイアログのまま**（作成だけは一覧上部で完結してよい）。
> 一覧ページからは `useUpdateXxx` を削除し、編集は詳細ページに任せる。

### RecordListPanel コンポーネント

詳細ページの左サイドに表示するレコード一覧パネル。同一種類の全レコードを表示し、クリックで他レコードの詳細へ遷移する。

`src/components/record-list-panel.tsx`:

```tsx
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export interface RecordListItem {
  id: string
  title: string
  subtitle?: string
  meta?: string
}

interface RecordListPanelProps {
  heading: string
  items: RecordListItem[]
  currentId?: string
  onSelect: (id: string) => void
  onClose: () => void
  className?: string
}

export function RecordListPanel({ heading, items, currentId, onSelect, onClose, className }: RecordListPanelProps) {
  return (
    <aside className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-semibold">
          {heading}
          <span className="ml-1 text-xs font-normal text-muted-foreground">({items.length})</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="一覧を閉じる">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="max-h-[calc(100vh-12rem)] flex-1">
        <ul className="p-1">
          {items.map((item) => {
            const active = item.id === currentId
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-primary/10 border-l-2 border-primary"
                      : "border-l-2 border-transparent hover:bg-muted",
                  )}
                >
                  <div className={cn("truncate text-sm", active ? "font-semibold text-primary" : "font-medium")}>
                    {item.title}
                  </div>
                  {item.subtitle && <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>}
                  {item.meta && <div className="truncate text-xs text-muted-foreground">{item.meta}</div>}
                </button>
              </li>
            )
          })}
          {items.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">レコードがありません</li>
          )}
        </ul>
      </ScrollArea>
    </aside>
  )
}
```

### 詳細ページの完全テンプレート

```tsx
import { useParams, useNavigate } from "react-router-dom"
import { useItems, useUpdateItem, useDeleteItem } from "@/hooks/use-dataverse"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RecordListPanel } from "@/components/record-list-panel"
import { useConfirm } from "@/providers/confirm-provider"
import { ArrowLeft, Pencil, Trash2, Save, X, List } from "lucide-react"
import { toast } from "sonner"
import { useState, useMemo } from "react"

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: items = [] } = useItems()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [showList, setShowList] = useState(false)

  // ID でクエリ結果から導出（キャッシュ更新で最新値を反映）
  const item = useMemo(() => items.find(i => i.{prefix}_itemid === id), [items, id])
  if (!item) return <div className="p-8 text-center text-muted-foreground">レコードが見つかりません</div>

  const startEdit = () => {
    setForm({
      {prefix}_name: item.{prefix}_name,
      {prefix}_field1: item.{prefix}_field1 ?? "",
      {prefix}_field2: item.{prefix}_field2 ?? "",
    })
    setEditing(true)
  }

  const handleSave = async () => {
    await updateItem.mutateAsync({ id: item.{prefix}_itemid, body: form })
    toast.success("保存しました")
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!(await confirm({
      title: "削除の確認",
      description: `「${item.{prefix}_name}」を削除しますか？`,
      confirmText: "削除",
      destructive: true,
    }))) return
    await deleteItem.mutateAsync(item.{prefix}_itemid)
    toast.success("削除しました")
    navigate("/items")  // 一覧へ戻る
  }

  return (
    <div className="flex gap-4">
      {/* 左サイド: レコード一覧パネル（トグル） */}
      {showList && (
        <RecordListPanel
          heading="アイテム一覧"
          items={items.map(i => ({
            id: i.{prefix}_itemid,
            title: i.{prefix}_name,
            subtitle: i.{prefix}_field1 ?? undefined,
          }))}
          currentId={item.{prefix}_itemid}
          onSelect={(rid) => navigate(`/items/${rid}`)}
          onClose={() => setShowList(false)}
        />
      )}

      {/* メインコンテンツ */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* ヘッダー: 戻る + レコード名 + アクションボタン */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/items")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold flex-1">{item.{prefix}_name}</h2>
          <Button
            variant={showList ? "secondary" : "outline"}
            onClick={() => setShowList(v => !v)}
          >
            <List className="h-4 w-4" />一覧
          </Button>
          {!editing && (
            <Button variant="outline" onClick={startEdit}>
              <Pencil className="h-4 w-4" />編集
            </Button>
          )}
          {!editing && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />削除
            </Button>
          )}
          {editing && (
            <Button onClick={handleSave} disabled={updateItem.isPending}>
              <Save className="h-4 w-4" />保存
            </Button>
          )}
          {editing && (
            <Button variant="outline" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />キャンセル
            </Button>
          )}
        </div>

        {/* フィールドカード */}
        <Card>
          <CardHeader><CardTitle>アイテム詳細</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>名称</Label>
                {editing
                  ? <Input value={(form.{prefix}_name as string) ?? ""} onChange={e => setForm({ ...form, {prefix}_name: e.target.value })} />
                  : <p className="mt-1">{item.{prefix}_name}</p>}
              </div>
              <div>
                <Label>フィールド1</Label>
                {editing
                  ? <Input value={(form.{prefix}_field1 as string) ?? ""} onChange={e => setForm({ ...form, {prefix}_field1: e.target.value })} />
                  : <p className="mt-1">{item.{prefix}_field1 ?? "-"}</p>}
              </div>
              {/* 全幅フィールド（説明文等） */}
              <div className="md:col-span-2">
                <Label>説明</Label>
                {editing
                  ? <Textarea value={(form.{prefix}_description as string) ?? ""} onChange={e => setForm({ ...form, {prefix}_description: e.target.value })} />
                  : <p className="mt-1 whitespace-pre-wrap">{item.{prefix}_description ?? "-"}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

### フィールド種別ごとの表示/編集切替

| フィールド種別 | 表示モード | 編集モード |
|---|---|---|
| テキスト | `<p className="mt-1">{value}</p>` | `<Input value={form.field} onChange={...} />` |
| 数値（金額等） | `<p className="mt-1">{formatCurrency(value)}</p>` | `<Input type="number" value={String(form.field)} onChange={...} />` |
| 日付 | `<p className="mt-1">{formatDate(value)}</p>` | `<Input type="date" value={form.field} onChange={...} />` |
| OptionSet | `<Badge className={colorMap[value]}>{labelMap[value]}</Badge>` | `<Select value={String(form.field)} onValueChange={...}>` |
| Lookup | `<p className="mt-1">{lookupMap.get(value)}</p>` | `<Select value={form.field} onValueChange={...}>` |
| 複数行テキスト | `<p className="mt-1 whitespace-pre-wrap">{value}</p>` | `<Textarea value={form.field} onChange={...} />` |
| ステータス/ステージ | `StagePath` コンポーネント（[ステージ矢羽パターン](stage-path-pattern.md)） | 同左（クリックで即更新） |
| Image 列 | `RecordImage` コンポーネント（[画像列の表示パターン](image-handling.md)） | `<input type="file">` + `uploadFileToRecord` |

> **Lookup フィールドの書き込み**: Dataverse の Lookup は `@odata.bind` 形式で送信する。
> ```tsx
> // 読み取り: _parentcustomerid_value (GUID)
> // 書き込み:
> body["parentcustomerid_account@odata.bind"] = `/accounts(${selectedAccountId})`
> ```

### サマリーヘッダー（オプション）

リードや商談など情報量の多いエンティティでは、フィールドカードの上に**サマリーヘッダー**を追加する。主要 4 項目をアイコン付きで横並びに表示する。

```tsx
<Card>
  <CardContent className="py-4">
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">会社名</div>
          <div className="truncate text-sm font-medium">{item.company ?? "-"}</div>
        </div>
      </div>
      {/* 他 3 項目... */}
    </div>
    {/* ステータス矢羽（オプション） */}
    <div className="mt-4 border-t pt-4">
      <StagePath stages={statusItems} current={item.status} onSelect={handleStatusSelect} />
    </div>
  </CardContent>
</Card>
```

---

## チェックリスト（CRUD 画面実装時）

- [ ] 一覧の行／カード全体がクリックで詳細**ページ**へ遷移する（`navigate`、`cursor-pointer` + ホバー）
- [ ] 「目」アイコン等の小さな詳細ボタンを置いていない
- [ ] 行内の削除・クイック操作は `e.stopPropagation()`
- [ ] 詳細画面はモーダルではなくフルページ遷移（`/items/:id` ルート）
- [ ] 詳細にインライン編集モード（`editing` ステート）がある
- [ ] 保存／キャンセル／削除がヘッダーに揃っている
- [ ] `RecordListPanel` で同種レコード一覧をトグル表示し、ワンクリックで切替できる
- [ ] 詳細は ID 保持＋クエリ導出で最新値を反映
- [ ] 対象切替時に編集モードをリセット（`useEffect`）
- [ ] 削除確認は `useConfirm()` モーダル（ブラウザ `confirm()` を使わない）
- [ ] 削除後は `navigate("/items")` で一覧へ戻る
- [ ] 一覧ページの新規作成はダイアログ、編集は詳細ページに委譲
- [ ] 一覧に所有者列・重要数値列（金額等）を表示している
- [ ] ステータス/ステージと所有者で絞り込め、名称＋関連名で検索できる
- [ ] 所有者フィルターは実データに存在する所有者のみ列挙している
- [ ] 所有者表示用に `$select` へ `_owninguser_value` を含めている
