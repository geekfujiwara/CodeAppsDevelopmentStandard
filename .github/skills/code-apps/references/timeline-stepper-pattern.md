# 縦タイムライン/ステッパーパターン（Vertical Timeline / Stepper）

配送経由地の配達状況、申請の処理履歴、工程の進捗、オンボーディングの手順など、
**順序を持つ項目の進行状態を上から下へ縦に並べて可視化する**汎用実装パターン。
追加ライブラリ不要（プレーンな `<ol>` + Tailwind + lucide アイコン）。
参考実装は [geek-delivery サンプル](../samples/geek-delivery/)（物流・配送先タイムライン）。

- ドットと縦線で「順序」を、ドットの色/アイコンで「状態」を表す
- 状態は 4 種: `done`（完了=チェック）/ `current`（現在地=強調リング）/ `problem`（異常=バツ）/ `pending`（未着手=順序数字）
- 各行に `meta`（バッジ・時刻）と `actions`（ボタン）を差し込めるので、閲覧だけでなくその場操作にも使える

> 横方向の段階表示（順序が短く「今どの段階か」だけ見せたい）は [ステージ矢羽パターン](stage-path-pattern.md) を使う。
> 縦タイムラインは項目数が多い・各項目に操作や詳細が付く場合に向く。

---

## コンポーネント本体

`src/components/vertical-timeline.tsx`:

```tsx
import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

export type TimelineState = "done" | "current" | "problem" | "pending"

export interface TimelineItem {
  id: string
  title: string
  subtitle?: string
  /** タイトル右側の補足（バッジ・時刻など） */
  meta?: ReactNode
  /** 行右端の操作エリア（ボタンなど） */
  actions?: ReactNode
  state: TimelineState
}

const DOT_CLASS: Record<TimelineState, string> = {
  done:    "bg-emerald-600 text-white",
  current: "bg-blue-600 text-white ring-4 ring-blue-500/20",
  problem: "bg-rose-600 text-white",
  pending: "bg-muted text-muted-foreground border",
}

/**
 * 縦タイムライン（ステッパー）。順序を持つ項目の進行状態を上から下へ可視化する。
 * done=チェック、problem=バツ、current=強調リング、pending=順序数字。
 */
export function VerticalTimeline({ items, emptyText = "項目がありません" }: {
  items: TimelineItem[]
  emptyText?: string
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <ol className="space-y-0">
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
          {/* 縦線（最後の項目には引かない） */}
          {i < items.length - 1 && (
            <span className="absolute left-[13px] top-7 h-[calc(100%-16px)] w-0.5 bg-border" aria-hidden="true" />
          )}
          {/* ドット */}
          <span className={cn(
            "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            DOT_CLASS[item.state],
          )}>
            {item.state === "done" ? <Check className="h-4 w-4" />
              : item.state === "problem" ? <X className="h-4 w-4" />
              : i + 1}
          </span>
          {/* 本文 */}
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn(
                  "text-sm font-medium leading-snug",
                  item.state === "pending" && "text-muted-foreground",
                )}>
                  {item.title}
                </p>
                {item.meta}
              </div>
              {item.subtitle && (
                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            {item.actions && <div className="flex shrink-0 items-center gap-1">{item.actions}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
```

---

## 使い方（Dataverse レコード → TimelineItem 変換）

状態の判定がこのパターンの肝。「完了/異常は確定状態、最初の未処理を current、残りは pending」とする:

```tsx
import { VerticalTimeline, type TimelineItem } from "@/components/vertical-timeline"

// 順序（seq）でソート済みの配送先
const stops = [...].sort((a, b) => (a[s.seq] ?? 0) - (b[s.seq] ?? 0))

// 「最初の未配達」を current にするため、その id を先に求めておく
const firstPending = stops.find(x => (x[s.status] ?? STOP_PENDING) === STOP_PENDING)
const firstPendingKey = firstPending ? String(firstPending[s.id]) : null

const items: TimelineItem[] = stops.map(stop => {
  const st = (stop[s.status] as number) ?? STOP_PENDING
  const state =
    st === STOP_DELIVERED ? "done"
    : st === STOP_ABSENT || st === STOP_RETURNED ? "problem"
    : String(stop[s.id]) === firstPendingKey ? "current"
    : "pending"
  return {
    id: String(stop[s.id]),
    title: String(stop[s.name] ?? ""),
    subtitle: String(stop[s.area] ?? ""),
    state,
    meta: st !== STOP_PENDING ? <StatusBadge status={st} /> : null,
    actions: <>{/* 配達完了/不在/持ち戻りボタン */}</>,
  }
})

<VerticalTimeline items={items} emptyText="配送先がありません" />
```

適用例:

| 業務 | 項目 | done | problem |
|---|---|---|---|
| 配送（物流） | 経由地 | 配達完了 | 不在・持ち戻り |
| 申請ワークフロー | 承認ステップ | 承認済み | 差戻し |
| オンボーディング | 手続き | 完了 | 保留・要確認 |
| 製造工程 | 工程 | 通過 | NG・手戻り |

---

## 設計上の注意

- **current は 1 つだけ**: 「最初の未処理」を current にする。全 pending を強調すると現在地が分からない。全項目が done なら current は無し（完了状態）。
- **縦線は最後の項目に引かない**: `i < items.length - 1` で条件付き描画。`top`/`height` はドットサイズ（h-7=28px）基準で調整する。
- **problem は「見た上で失敗/保留」**: pending（未着手）と区別する。異常があっても後続を進められる業務（不在でも次へ配達）では、problem の後の項目も current/pending になり得る。
- **actions は状態で出し分ける**: 未処理なら結果記録ボタン、処理済みなら「戻す」ボタン、のように状態依存で切り替えると 1 画面で完結する。
- **並び順は呼び出し側で保証**: コンポーネントは配列順にそのまま描画する。`seq` 列でのソートは呼び出し側の責務。
- **レスポンシブ**: 本文と actions を `flex-col sm:flex-row` にして、狭い画面では操作ボタンが本文の下に回り込むようにする。
