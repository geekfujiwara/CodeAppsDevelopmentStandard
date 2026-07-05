# クロス集計マトリクスパターン（Cross-Tab / Pivot）

指摘の場所×分類、勤怠の人×日、在庫の倉庫×カテゴリ、スキルマップの人×技術など、
**2 軸の組み合わせごとの件数を表で俯瞰し、集中箇所をヒート色で浮かび上がらせる**汎用実装パターン。
追加ライブラリ不要（プレーンな `<table>` + Tailwind）。
参考実装は [geek-punchlist サンプル](../samples/geek-punchlist/)（建設業・竣工検査の指摘マトリクス）。

- 行・列はデータの出現キーから自動生成（マスタ不要）
- セルは件数 + ヒート色（最大値に対する比率で透明度を変える）。0 件は `·` で控えめに表示
- 合計行・合計列付き。行/列ヘッダーは `whitespace-nowrap` + 横スクロールで日本語の長いキーに対応

---

## コンポーネント本体

`src/components/cross-tab.tsx`:

```tsx
import { useMemo } from "react"
import { cn } from "@/lib/utils"

/**
 * クロス集計マトリクス（ピボット表）。
 * entries（行キー×列キーの組）を件数集計し、値の大きさに応じたヒート色で表示する。
 * 行・列は出現キーから自動生成し、合計行・合計列を付ける。
 */
export function CrossTab({ entries, rowHeader = "行", heatColor = "59,130,246", emptyText = "データがありません" }: {
  entries: { row: string; col: string }[]
  rowHeader?: string
  /** ヒート色の RGB（"r,g,b" 形式）。値の比率で透明度を変える */
  heatColor?: string
  emptyText?: string
}) {
  const { rows, cols, counts, rowTotals, colTotals, max, total } = useMemo(() => {
    // 行キー・列キーに任意の文字列（空白含む）を許容するため、複合キーではなく二重 Map で集計する
    const counts = new Map<string, Map<string, number>>()
    const colSet = new Set<string>()
    for (const e of entries) {
      colSet.add(e.col)
      const rowMap = counts.get(e.row) ?? new Map<string, number>()
      rowMap.set(e.col, (rowMap.get(e.col) ?? 0) + 1)
      counts.set(e.row, rowMap)
    }
    const rows = [...counts.keys()].sort((a, b) => a.localeCompare(b, "ja"))
    const cols = [...colSet].sort((a, b) => a.localeCompare(b, "ja"))
    const rowTotals = new Map<string, number>()
    const colTotals = new Map<string, number>()
    let max = 0
    for (const [row, rowMap] of counts) {
      for (const [col, v] of rowMap) {
        rowTotals.set(row, (rowTotals.get(row) ?? 0) + v)
        colTotals.set(col, (colTotals.get(col) ?? 0) + v)
        if (v > max) max = v
      }
    }
    return { rows, cols, counts, rowTotals, colTotals, max, total: entries.length }
  }, [entries])

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  const cellStyle = (value: number) => {
    if (value === 0 || max === 0) return undefined
    const ratio = value / max
    return { backgroundColor: `rgba(${heatColor}, ${0.12 + 0.58 * ratio})` }
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{rowHeader}</th>
            {cols.map(c => (
              <th key={c} className="whitespace-nowrap px-3 py-2 text-center font-medium text-muted-foreground">{c}</th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-muted-foreground">合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r} className="border-b last:border-b-0">
              <td className="whitespace-nowrap px-3 py-2 font-medium">{r}</td>
              {cols.map(c => {
                const v = counts.get(r)?.get(c) ?? 0
                const ratio = max > 0 ? v / max : 0
                return (
                  <td
                    key={c}
                    className={cn("px-3 py-2 text-center tabular-nums", v === 0 && "text-muted-foreground/40", ratio > 0.6 && "font-semibold")}
                    style={cellStyle(v)}
                  >
                    {v > 0 ? v : "·"}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-center font-semibold tabular-nums bg-muted/30">{rowTotals.get(r) ?? 0}</td>
            </tr>
          ))}
          {/* 合計行 */}
          <tr className="border-t bg-muted/30">
            <td className="px-3 py-2 font-semibold">合計</td>
            {cols.map(c => (
              <td key={c} className="px-3 py-2 text-center font-semibold tabular-nums">{colTotals.get(c) ?? 0}</td>
            ))}
            <td className="px-3 py-2 text-center font-bold tabular-nums">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

---

## 使い方（Dataverse レコード → entries 変換）

呼び出し側はフィルター済みレコードを `{ row, col }` の配列にするだけ:

```tsx
import { CrossTab } from "@/components/cross-tab"

const entries = useMemo(() =>
  items
    .filter(item => siteFilter === "all" || String(item[f.site_ref]) === siteFilter)
    .filter(item => scope === "all" || (item[f.status] as number) !== ITEM_VERIFIED)
    .map(item => ({
      row: (item[f.location] as string) || "場所未設定",
      col: (item[f.category] as string) || "未分類",
    })),
  [items, siteFilter, scope]
)

<CrossTab entries={entries} rowHeader="場所" emptyText="未完了の指摘がありません" />
```

適用例:

| 業務 | row | col |
|---|---|---|
| 竣工検査（建設） | 場所（階・部屋） | 指摘分類 |
| ヘルプデスク | 部署 | 問い合わせカテゴリ |
| 安全衛生 | 拠点 | ヒヤリハット種別 |
| スキルマップ | 社員 | 技術領域 |

---

## 設計上の注意

- **集計は二重 Map で行う**: `"${row} ${col}"` のような複合文字列キーは、キー自体に空白・区切り文字が含まれると分解時に壊れる（「3F 廊下」等）。`Map<string, Map<string, number>>` なら任意の文字列キーを安全に扱える。
- **ヒートは透明度で表現**: `rgba(r,g,b, 0.12 + 0.58 × 比率)` の背景色ならライト/ダーク両テーマで破綻しない。比率 0.6 超のセルは `font-semibold` で数字も強調する。
- **0 件セルは `·`**: 空白にすると罫線だけの表に見え、`0` を並べるとノイズになる。中点なら「確認済みで 0 件」が視覚的に伝わる。
- **行・列のソートは `localeCompare(a, b, "ja")`**: 日本語キーの並びが安定する。階数（1F/2F/10F）を数値順にしたい場合は呼び出し側で `row` キーをゼロ埋め（`01F`）にするか、比較関数を差し替える。
- **キーの正規化は呼び出し側の責務**: 「3F」と「3Ｆ」（全角）が別行になる。入力時のプレースホルダーで表記を誘導するか、entries 生成時に正規化する。
- **値の合算（件数以外）が必要なら**: 本パターンは件数集計。金額・数量を合算する場合は `entries` に `value` を追加し、集計部の `+1` を `+e.value` に変える。
