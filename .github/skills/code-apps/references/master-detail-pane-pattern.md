# 一覧ペイン（マスター詳細）パターン

詳細画面の左側にレコード一覧を常駐させ、ページ遷移せずに次のレコードへ切り替えられるようにするパターン。
レビュー・査閲・問い合わせ対応など、**複数レコードを次々に見比べる業務**で使う。

一覧ページ（テーブル）は俯瞰・絞り込み用、一覧ペインは詳細を見ながらの移動用。両者は併存させる。

```
┌──────────────┬────────────────────────────────┐
│ 一覧ペイン     │ 詳細                             │
│ [検索  ]      │  タイトル / バッジ                 │
│ ─────────    │ ┌────────────┬──────────┐      │
│ ▸ 項目 A ←現在 │ │ 本文        │ サイド      │      │
│ ▸ 項目 B      │ └────────────┴──────────┘      │
│ ▸ 項目 C      │                                │
└──────────────┴────────────────────────────────┘
```

## 正常系フロー

### Step 1. クエリキーとフィルターを lib に集約する

一覧ページと一覧ペインが**同じキーで同じデータを引く**ようにする。キーがずれると同じ内容を 2 回取得し、
片方だけ古いまま残る。

```typescript
// lib/items.ts
export const ITEMS_KEY = ["items"]

export type ItemFilter = { search: string; owner: string }
export const EMPTY_ITEM_FILTER: ItemFilter = { search: "", owner: "" }

export function itemsQueryKey(filter: ItemFilter = EMPTY_ITEM_FILTER) {
  return [...ITEMS_KEY, filter.search, filter.owner]
}
```

### Step 2. 検索は Dataverse 側で行う（クライアント側 filter にしない）

取得済みの配列を `Array.filter()` で絞ると、`top` の範囲外にある古いレコードが永久に検索に掛からない。
`$filter` の `contains()` で サーバー側に投げる。

**OData の文字列リテラルは単一引用符で囲み、エスケープはシングルクォートの 2 重化のみ。**
ユーザー入力を素通しすると `$filter` 式を壊される。必ずエスケープ関数を通す。

```typescript
// OData string literals are single quoted, and doubling the quote is the only escape there is.
function quote(value: string): string {
  return value.replace(/'/g, "''")
}

function buildFilter({ search, owner }: ItemFilter): string | undefined {
  const clauses: string[] = []
  if (owner) clauses.push(`${F.owner} eq '${quote(owner)}'`)

  const term = search.trim()
  if (term) {
    const t = quote(term)
    clauses.push(`(contains(${F.title},'${t}') or contains(${F.body},'${t}'))`)
  }
  return clauses.length > 0 ? clauses.join(" and ") : undefined
}

export async function listItems(
  filter: ItemFilter = EMPTY_ITEM_FILTER,
  top = 500,
): Promise<Item[]> {
  const rows = await DataverseService.ListRecords(ENTITY_SET, {
    select: Object.values(F),
    filter: buildFilter(filter),
    orderBy: `${F.createdOn} desc`,
    top,
  })
  return rows.map(toItem)
}
```

> **複数行テキスト（memo）列にも `contains()` は使える。** 実装前に 1 度 Web API を直接叩いて確認しておく。

### Step 3. 一覧ペインを実装する

**スクロール領域に `ScrollArea` を使わない。** 詳細は Step 6 の落とし穴表を参照。

```tsx
// components/item-nav.tsx
import { useEffect, useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Loader2, List, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { EMPTY_ITEM_FILTER, itemsQueryKey, listItems } from "@/lib/items"

export function ItemNav({ currentId }: { currentId: string }) {
  const [search, setSearch] = useState("")
  const [term, setTerm] = useState("")

  // Every keystroke would otherwise be a Dataverse round trip.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  const filter = useMemo(() => ({ ...EMPTY_ITEM_FILTER, search: term }), [term])
  const { data, isLoading, isFetching } = useQuery({
    queryKey: itemsQueryKey(filter),
    queryFn: () => listItems(filter),
    placeholderData: keepPreviousData, // 検索中に一覧が空へ飛ばない
  })

  const items = data ?? []

  return (
    <aside className="flex h-[calc(100dvh-9rem)] min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      {/* ヘッダー: shrink-0 相当（flex 子のデフォルト） */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <List className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">一覧</span>
        <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
      </div>

      {/* 検索 */}
      <div className="relative border-b p-2">
        <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="検索"
          className="h-8 pl-7 pr-7 text-xs"
        />
        {isFetching && (
          <Loader2 className="absolute right-4 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* ScrollArea だと truncate が効かないので素の div でスクロールさせる */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">該当する項目がありません</p>
        ) : (
          <ul className="p-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/items/${item.id}`}
                  className={`block rounded-md px-2 py-2 text-xs ${
                    item.id === currentId ? "bg-primary/10 font-medium" : "hover:bg-muted"
                  }`}
                >
                  {/* 1 行 1 情報。横に並べない */}
                  <div className="truncate">{item.title}</div>
                  <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                    {item.body || "(なし)"}
                  </p>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatDateTime(item.createdOn)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
```

### Step 4. 詳細ページに shell として組み込む

ローディング中・エラー時にもペインが消えないよう、**3 状態すべてを同じ shell で包む**。
ペインだけ先に描画されるので、詳細の読み込み中も他レコードへ移動できる。

```tsx
export default function ItemDetail() {
  const { id = "" } = useParams()
  const { data, isLoading, isError } = useQuery({ ... })

  const shell = (children: React.ReactNode) => (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* sticky で詳細をスクロールしてもペインが画面内に残る */}
      <div className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
        <ItemNav currentId={id} />
      </div>
      {/* minmax(0,1fr) と min-w-0 の両方が要る。片方だけだと詳細側がはみ出す */}
      <div className="min-w-0">{children}</div>
    </div>
  )

  if (isLoading) return shell(<LoadingSkeletonList count={3} />)
  if (isError || !data) return shell(<ErrorState />)
  return shell(<div className="space-y-6">...</div>)
}
```

### Step 5. 詳細側の内部グリッドは 1 段階広いブレークポイントへ送る

ペインが 280px を占めるため、詳細側に残る幅は従来より狭い。
詳細内の 2 段組を `lg:` のままにすると中間サイズで潰れる。**`xl:` に上げる。**

```tsx
// ❌ ペイン導入前のまま → lg で詳細が窮屈
<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">

// ✅ ペインぶんの幅を考慮
<div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
```

`lg` 未満ではペインを `hidden` にし、詳細を全幅で見せる（モバイルは一覧ページから遷移する導線）。

### Step 6. 落とし穴チェック

| # | 症状 | 原因 | 対処 |
|---|------|------|------|
| 1 | **文字が見切れる／横にはみ出す** | `ScrollArea` の内部 Viewport が `display: table` + 水平スクロール許容で、`truncate` の前提である幅制約を無効化する | `ScrollArea` をやめ `div` + `overflow-y-auto overflow-x-hidden` にする |
| 2 | 名前がほぼ表示されない | 名前と日時を 1 行に同居させ、固定幅の日時に幅を奪われた | **1 行 1 情報**。日時は独立行へ落とす |
| 3 | スクロールバーが出ない／下が切れる | flex 子のデフォルト `min-height: auto` でスクロール領域がコンテンツ高さまで膨張 | 親に `overflow-hidden`、スクロール領域に `flex-1 min-h-0` |
| 4 | 古いレコードが検索に出ない | 取得済み配列をクライアント側で `filter` している | `$filter` の `contains()` でサーバー側検索（Step 2） |
| 5 | 検索のたびに画面がちらつく／空になる | `placeholderData` 未指定 | `placeholderData: keepPreviousData` |
| 6 | 打鍵ごとに Dataverse 呼び出し | デバウンスなし | 400ms デバウンス（Step 3） |
| 7 | 一覧ページとペインで内容が食い違う | クエリキーが別 | `itemsQueryKey()` を共有（Step 1） |
| 8 | 長い URL や英数字連続で横スクロールが出る | `line-clamp` だけでは分割されない | `break-words` を併用 |

**実装後の目視確認**（ブラウザ幅を狭めて 1 回ずつ）:

- [ ] ペイン内の長い名前が `...` で省略され、横スクロールバーが出ない
- [ ] 詳細を下までスクロールしてもペインが追従して見えている
- [ ] 検索語を入れると件数が変わり、スピナーが出て、結果が空でも文言が出る
- [ ] `lg` 未満でペインが消え、詳細が全幅になる
- [ ] ペインの項目をクリックすると詳細だけ差し替わり、ペインの位置が保たれる

## 関連

- [デザインシステム](design-pattern.md) の「ScrollArea 使用禁止（マルチカラム・truncate 併用時）」「truncate チェーン」
- [CRUD UI 標準パターン](crud-ui-pattern.md) の「一覧の検索・フィルター・重要列」
- [トラブルシューティング](troubleshooting.md) の「Radix ScrollArea が flex-1 だけではスクロールしない」
