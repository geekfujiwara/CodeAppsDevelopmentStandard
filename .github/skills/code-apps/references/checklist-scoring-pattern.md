# チェックリスト採点パターン（Checklist Scoring）

臨店チェック・安全点検・監査・棚卸・入居前点検など、**「項目リストを 1 件ずつ判定してスコア化する」業務**の汎用実装パターン。
参考実装は [geek-store サンプル](../samples/geek-store/)（小売業の臨店チェック）。

構成要素は 4 つ:

1. **判定トグル（ResultToggle）** — 合格/不合格/対象外 をワンクリックで切替
2. **スコア計算（computeChecklistStats）** — 対象外を分母から除外した採点と、未確認を含めた進捗
3. **親レコードへのスコア同期** — 判定のたびに親（点検・監査）の `score` 列へ patch
4. **テンプレート一括生成** — 標準チェックリスト定義から子レコードを一括作成

> データモデルは「親（audit）1 : 子（item）N」。子は `{prefix}_audit_ref`（String, 親の GUID）で紐づける。
> **一括生成は詳細画面で行う**（ルートパラメータから親 GUID が確定しているため、createRecord の戻り値の形に依存しない）。

---

## 1. 判定トグル

`src/components/result-toggle.tsx`:

```tsx
import { cn } from "@/lib/utils"

export interface ResultToggleOption {
  value: number
  label: string
  /** 選択中の配色（例: "bg-emerald-600 text-white"）。省略時は primary */
  activeClass?: string
}

/**
 * 合格/不合格/対象外 のような排他的な判定を 1 クリックで切り替えるセグメントトグル。
 * 選択中のボタンをもう一度クリックすると onSelect に同じ値が渡る（呼び出し側で
 * 「同値なら未確認へ戻す」トグル挙動を実装できる）。
 */
export function ResultToggle({ options, value, onSelect, disabled }: {
  options: ResultToggleOption[]
  value?: number
  onSelect: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      {options.map((opt, i) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              i > 0 && "border-l",
              active
                ? (opt.activeClass ?? "bg-primary text-primary-foreground")
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

選択肢は OptionSet と対にして types 側で定義する:

```typescript
export const RESULT_UNCHECKED = 100000000
export const RESULT_PASS      = 100000001
export const RESULT_FAIL      = 100000002
export const RESULT_NA        = 100000003

export const RESULT_TOGGLE_OPTIONS = [
  { value: RESULT_PASS, label: "合格",   activeClass: "bg-emerald-600 text-white" },
  { value: RESULT_FAIL, label: "不合格", activeClass: "bg-rose-600 text-white" },
  { value: RESULT_NA,   label: "対象外", activeClass: "bg-gray-500 text-white" },
]
```

「同じ判定をもう一度クリックしたら未確認へ戻す」は呼び出し側で実装する（誤操作の取り消しが 1 クリックで済む）:

```tsx
const handleResultSelect = async (item: Record<string, unknown>, value: number) => {
  const current = (item[it.result] as number) ?? RESULT_UNCHECKED
  const next = current === value ? RESULT_UNCHECKED : value
  await updateItem.mutateAsync({ id: String(item[it.id]), data: { [it.result]: next } })
  await syncScore(/* 変更を反映した判定値の配列 */)
}
```

---

## 2. スコア計算

`src/lib/checklist.ts`:

```typescript
export interface ChecklistStats {
  total: number
  checked: number        // 判定済み（未確認以外）
  pass: number
  fail: number
  progress: number       // 判定済み / 全体（0-100）
  score: number | null   // 合格 / (合格 + 不合格) × 100。判定対象 0 件なら null（未実施）
}

/**
 * - 対象外（N/A）はスコアの分母に含めない（対象外にした項目で点が下がらない）
 * - 未確認は進捗の分母に含める（全項目を確認して初めて 100%）
 */
export function computeChecklistStats(results: number[]): ChecklistStats {
  const total = results.length
  const checked = results.filter(v => v !== RESULT_UNCHECKED).length
  const pass = results.filter(v => v === RESULT_PASS).length
  const fail = results.filter(v => v === RESULT_FAIL).length
  const denominator = pass + fail
  return {
    total, checked, pass, fail,
    progress: total > 0 ? Math.round((checked / total) * 100) : 0,
    score: denominator > 0 ? Math.round((pass / denominator) * 100) : null,
  }
}
```

---

## 3. 親レコードへのスコア同期

一覧・ダッシュボード・レポートが**子を集計せずに親の `score` 列だけで表示できる**ように、
判定変更・項目削除のたびに再計算して親へ patch する。React Query の invalidate 前に
「変更を反映した配列」を手元で作るのがポイント（キャッシュ更新を待たない）。

```tsx
const syncScore = async (nextResults: number[]) => {
  const next = computeChecklistStats(nextResults)
  if (next.score != null) {
    await updateAudit.mutateAsync({ id, data: { [a.score]: next.score } })
  }
}

// 判定変更時: 対象項目だけ差し替えた配列を渡す
await syncScore(items.map(x =>
  String(x[it.id]) === itemId ? next : ((x[it.result] as number) ?? RESULT_UNCHECKED)
))
```

---

## 4. テンプレート一括生成

標準チェックリストは**コード側の定数**として定義する（マスタテーブル化は、店舗ごとに項目が違う等の要件が出てから）:

```typescript
export const STANDARD_CHECKLIST: { category: string; name: string }[] = [
  { category: "清掃・衛生", name: "店頭・入口が清掃されている" },
  { category: "陳列・売場", name: "欠品なく商品が補充されている" },
  { category: "接客",       name: "挨拶・身だしなみが基準を満たしている" },
  { category: "安全",       name: "避難経路が確保されている" },
  // ...
]
```

詳細画面（親 GUID が確定している場所）で、項目が 0 件のときに生成ボタンを出す:

```tsx
const handleGenerate = async () => {
  setIsGenerating(true)
  try {
    for (const tpl of STANDARD_CHECKLIST) {
      await createItem.mutateAsync({
        [it.name]:      tpl.name,
        [it.audit_ref]: id,           // useParams のルートパラメータ（親 GUID）
        [it.category]:  tpl.category,
        [it.result]:    RESULT_UNCHECKED,
      })
    }
    toast.success(`標準チェックリスト ${STANDARD_CHECKLIST.length} 項目を生成しました`)
  } finally {
    setIsGenerating(false)
  }
}
```

---

## カテゴリ別グルーピング表示

テンプレートのカテゴリ順を優先しつつ、手動追加のカテゴリは末尾に回す:

```tsx
const grouped = useMemo(() => {
  const order = [...new Set(STANDARD_CHECKLIST.map(c => c.category))]
  const map = new Map<string, Record<string, unknown>[]>()
  for (const item of items) {
    const cat = (item[it.category] as string) || "その他"
    map.set(cat, [...(map.get(cat) ?? []), item])
  }
  return [...map.entries()].sort((x, y) => {
    const xi = order.indexOf(x[0]); const yi = order.indexOf(y[0])
    return (xi === -1 ? 999 : xi) - (yi === -1 ? 999 : yi)
  })
}, [items])
```

カテゴリごとの Card にヘッダーで `合格 n / 不合格 n / 全 n 項目` を表示し、
不合格の行は `border-rose-200 bg-rose-50/50`（ダーク: `dark:border-rose-900 dark:bg-rose-950/20`）で薄く強調する。

---

## 設計上の注意

- **「未確認」と「対象外」を混同しない**: 未確認 = まだ見ていない（進捗の分母に入る）、対象外 = 見た上で採点対象から外す（スコアの分母から抜く）。この区別を落とすと「確認していないのに 100 点」が起きる。
- **スコアは親に永続化する**: 一覧・ダッシュボードのたびに全子レコードを集計しない。判定変更時に patch する方が読み取りが圧倒的に多い業務では安上がり。
- **一括生成は逐次 create**: Dataverse Web API のバッチは SDK 経由で使えないため `for...of` + `await` で直列に作成する。10〜20 項目なら体感 2〜3 秒。生成中はボタンを `disabled` + 「生成中...」表示にする。
- **テンプレート変更と過去データ**: `STANDARD_CHECKLIST` を変更しても生成済みの項目には影響しない（スナップショットとして残る）。これは監査証跡としては正しい挙動。
- **不合格コメント**: 判定と同じ行にコメントアイコンを置き、モーダルで編集する。不合格時にコメント必須にする場合は `handleResultSelect` で `RESULT_FAIL` 選択時にコメントモーダルを連続で開く。
