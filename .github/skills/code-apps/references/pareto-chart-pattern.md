# パレート図パターン（Pareto Chart）

不良分析・クレーム分析・在庫 ABC 分析・問い合わせ分類など、**「上位の少数分類が全体の大半を占める」ことを可視化して対策の優先順位を付ける**汎用実装パターン。
Recharts の `ComposedChart`（棒 + 折れ線の複合）だけで実装でき、追加依存はない。
参考実装は [geek-quality サンプル](../samples/geek-quality/)（製造業の不良分類分析）。

構成要素は 2 つ:

1. **toParetoData** — 分類別集計を降順ソートし累積構成比（%）を付与するユーティリティ
2. **ParetoChart** — 棒（件数/数量・左軸）+ 累積構成比の折れ線（右軸 0-100%）+ 80% 基準線。累積 80% までの分類（重点対策対象）を強調色で塗る

---

## 1. データ変換ユーティリティ

`src/lib/pareto.ts`:

```typescript
export interface ParetoDatum {
  name: string
  value: number
  /** 累積構成比（0-100） */
  cumulative: number
}

/**
 * 分類別の件数・数量をパレート図用データに変換する。
 * 値の大きい順に並べ替え、累積構成比（%）を付与する。
 */
export function toParetoData(entries: { name: string; value: number }[]): ParetoDatum[] {
  const sorted = [...entries].filter(e => e.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, e) => sum + e.value, 0)
  let running = 0
  return sorted.map(e => {
    running += e.value
    return {
      name: e.name,
      value: e.value,
      cumulative: total > 0 ? Math.round((running / total) * 100) : 0,
    }
  })
}
```

---

## 2. チャートコンポーネント

`src/components/pareto-chart.tsx`:

```tsx
import { useMemo } from "react"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"
import { toParetoData } from "@/lib/pareto"

/**
 * パレート図（棒: 件数/数量の降順、折れ線: 累積構成比 %）。
 * 80% の水平線（ReferenceLine）で重点管理の目安を示す。
 */
export function ParetoChart({ entries, height = 260, barName = "件数", topBarColor = "#ef4444", barColor = "#3b82f6" }: {
  entries: { name: string; value: number }[]
  height?: number
  barName?: string
  /** 累積 80% までの分類（重点対策対象）の棒色 */
  topBarColor?: string
  barColor?: string
}) {
  const data = useMemo(() => toParetoData(entries), [entries])

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">データがありません</p>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v, name) => name === "累積構成比" ? [`${v}%`, name] : [v, name]} />
        <Legend />
        <ReferenceLine yAxisId="right" y={80} stroke="#9ca3af" strokeDasharray="4 4" />
        <Bar yAxisId="left" dataKey="value" name={barName} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => {
            // ひとつ前までの累積が 80% 未満の分類 = 重点対策対象を強調色にする
            const prevCumulative = i === 0 ? 0 : data[i - 1].cumulative
            return <Cell key={i} fill={prevCumulative < 80 ? topBarColor : barColor} />
          })}
        </Bar>
        <Line yAxisId="right" dataKey="cumulative" name="累積構成比" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

---

## 使い方（Dataverse レコード → 分類別集計）

```tsx
import { ParetoChart } from "@/components/pareto-chart"

// 不良レコードを分類別に数量集計してから渡す
const paretoEntries = useMemo(() => {
  const map = new Map<string, number>()
  for (const defect of defects) {
    const cat = (defect[d.category] as string) || "未分類"
    map.set(cat, (map.get(cat) ?? 0) + ((defect[d.qty] as number) ?? 0))
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }))
}, [defects])

<ParetoChart entries={paretoEntries} barName="不良数量" />
```

適用例:

| 業務 | name | value |
|---|---|---|
| 不良分析（製造） | 不良分類 | 不良数量 |
| クレーム分析 | クレーム種別 | 件数 |
| 在庫 ABC 分析 | 品目 | 出荷金額 |
| 問い合わせ分析 | カテゴリ | チケット件数 |

---

## 設計上の注意

- **2 軸（yAxisId）を必ず分ける**: 棒は左軸（実数）、折れ線と 80% 基準線は右軸（0-100% 固定）。同一軸に載せると件数のスケールに引きずられて折れ線が読めなくなる。
- **強調色の判定は「ひとつ前までの累積」**: `data[i-1].cumulative < 80` で判定する。自身の累積で判定すると、80% をまたぐ分類（対策すべき最後の 1 分類）が強調から漏れる。
- **X 軸ラベルの重なり対策**: 分類名は日本語で長くなりがち。`interval={0}`（全ラベル表示）+ `angle={-20}` + `height={50}` で斜め表示にする。分類数が 10 を超える場合は上位 10 + 「その他」に丸める。
- **0 件の分類は除外**: `toParetoData` 内で `value > 0` のみ残す。0 件の棒が並ぶと累積線が横這いになり読みにくい。
- **並び順はコンポーネント側で保証**: 呼び出し側で集計だけ行い、降順ソートと累積計算は `toParetoData` に集約する（呼び出し側のソート忘れで折れ線が乱高下する事故を防ぐ）。
- **期間フィルターと併用する場合**: entries を作る useMemo の入力段階で期間で絞る。チャート側は関知しない。
