# しきい値ゲージパターン（Threshold Gauge）

温度・湿度・pH・在庫水準・数値目標など、**測定値が管理基準（上下限）の範囲内かをその場で可視化し、逸脱を判定する**汎用実装パターン。
判定ロジックを UI から切り離した**純粋関数**にし、その結果を横バーの**ゲージ**とバッジで表示する 2 層構成。追加ライブラリ不要（プレーンな div + Tailwind）。
参考実装は [geek-haccp サンプル](../samples/geek-haccp/)（飲食・HACCP 温度/衛生点検）。

- 判定は純粋関数 `judgeThreshold(value, min, max)` に集約 → 一覧・フォーム・集計・ダッシュボードで同じ判定を再利用
- `min`/`max` はどちらか一方だけでも良い（**片側規格**: 加熱は下限のみ、冷蔵は上限のみ）
- ゲージは適合帯（緑）の中に測定値マーカーを置き、逸脱時はマーカーが帯の外に出る。負値（冷凍 -18℃ 等）にも対応

> 「合否を色分けした帯で見せる」だけなら [チェックリスト採点パターン](checklist-scoring-pattern.md) のスコアバーで足りる。
> しきい値ゲージは**連続値**を**基準レンジ**と照合し、上振れ/下振れの方向まで見せたいときに向く。

---

## レイヤ 1: 判定ロジック（純粋関数）

`src/lib/threshold.ts` — UI に依存しないので単体テスト・他アプリ流用が容易。**このファイルがパターンの核**:

```ts
export type Judgement = "ok" | "low" | "high" | "none"

export interface ThresholdResult {
  judgement: Judgement
  /** true = 逸脱（low or high） */
  deviated: boolean
  label: string
  /** バッジ色クラス */
  colorClass: string
}

/**
 * 測定値を基準の上下限（min/max）と照合して合否を判定する。
 * min/max はどちらか一方だけでも良い（片側規格）。value が未入力なら "none"。
 */
export function judgeThreshold(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): ThresholdResult {
  if (value == null || Number.isNaN(value)) {
    return { judgement: "none", deviated: false, label: "未測定", colorClass: "bg-gray-100 text-gray-600" }
  }
  if (min != null && value < min) {
    return { judgement: "low", deviated: true, label: "下限逸脱", colorClass: "bg-blue-100 text-blue-800" }
  }
  if (max != null && value > max) {
    return { judgement: "high", deviated: true, label: "上限逸脱", colorClass: "bg-red-100 text-red-800" }
  }
  return { judgement: "ok", deviated: false, label: "適合", colorClass: "bg-green-100 text-green-800" }
}

/** 基準レンジの表示文字列（"1〜5℃" / "≤ -18℃" / "≥ 75℃"） */
export function formatRange(min: number | null | undefined, max: number | null | undefined, unit = ""): string {
  if (min != null && max != null) return `${min}〜${max}${unit}`
  if (max != null) return `≤ ${max}${unit}`
  if (min != null) return `≥ ${min}${unit}`
  return "—"
}
```

---

## レイヤ 2: ゲージコンポーネント

`src/components/threshold-gauge.tsx` — レイヤ 1 の判定結果を横バーで可視化:

```tsx
import { judgeThreshold, formatRange } from "@/lib/threshold"
import { cn } from "@/lib/utils"

/**
 * 基準レンジに対する測定値の位置を横バーで表示するゲージ。
 * 適合帯（緑）の中に測定値のマーカーを置き、逸脱時はマーカーが帯の外（左=下限/右=上限）に出る。
 * min/max のどちらかが未設定（片側規格）でも動作する。
 */
export function ThresholdGauge({ value, min, max, unit = "", className }: {
  value: number | null | undefined
  min: number | null | undefined
  max: number | null | undefined
  unit?: string
  className?: string
}) {
  const result = judgeThreshold(value, min, max)

  // 表示レンジ: min/max の周辺に余白を取る。片側規格は基準値の ±50% を仮レンジにする
  const lo = min ?? (max != null ? max - Math.abs(max) * 0.5 - 1 : 0)
  const hi = max ?? (min != null ? min + Math.abs(min) * 0.5 + 1 : 100)
  const span = hi - lo || 1
  const pad = span * 0.25
  const axisLo = lo - pad
  const axisHi = hi + pad
  const axisSpan = axisHi - axisLo || 1

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - axisLo) / axisSpan) * 100))
  const bandLeft = pct(min ?? axisLo)
  const bandRight = pct(max ?? axisHi)
  const markerPct = value != null && !Number.isNaN(value) ? pct(value) : null

  const markerColor = result.judgement === "ok" ? "bg-emerald-600"
    : result.judgement === "none" ? "bg-gray-400"
    : "bg-rose-600"

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>基準 {formatRange(min, max, unit)}</span>
        <span className={cn("font-semibold", result.deviated ? "text-rose-600" : result.judgement === "ok" ? "text-emerald-600" : "")}>
          {value != null && !Number.isNaN(value) ? `${value}${unit}` : "—"}
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-muted">
        {/* 適合帯 */}
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-500/30"
          style={{ left: `${bandLeft}%`, right: `${100 - bandRight}%` }}
        />
        {/* 測定値マーカー */}
        {markerPct != null && (
          <div
            className={cn("absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", markerColor)}
            style={{ left: `${markerPct}%` }}
          />
        )}
      </div>
    </div>
  )
}
```

---

## 使い方

**入力フォームでリアルタイム判定**（点検項目を選ぶ → その場でゲージが合否を表示）:

```tsx
const cp = checkpointMap.get(selectedCheckpointId)
<ThresholdGauge
  value={form.value === "" ? null : Number(form.value)}
  min={(cp?.[c.min] as number | null) ?? null}
  max={(cp?.[c.max] as number | null) ?? null}
  unit={String(cp?.[c.unit] ?? "")}
/>
```

**一覧・ダッシュボードで判定バッジ**（同じ純粋関数を再利用）:

```tsx
const j = judgeThreshold(m[f.value] as number | null, cpMin, cpMax)
<span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", j.colorClass)}>{j.label}</span>
// 逸脱行のハイライト: <TableRow className={j.deviated ? "bg-rose-50" : ""}>
```

**集計**（`deviated` フラグで逸脱率・ヒートマップを組む → [クロス集計パターン](cross-tab-pattern.md)）:

```tsx
const deviatedCount = measurements.filter(m => judge(m).deviated).length
const complianceRate = Math.round((total - deviatedCount) / total * 100)
```

適用例:

| 業務 | 測定値 | 下限（min） | 上限（max） |
|---|---|---|---|
| HACCP 温度点検（飲食） | 庫内温度・中心温度 | 加熱 75℃ | 冷蔵 5℃ / 冷凍 -18℃ |
| 品質検査（製造） | 寸法・重量 | 規格下限 | 規格上限 |
| 環境モニタリング | 室温・湿度・CO₂ | 快適域下限 | 快適域上限 |
| 在庫管理 | 在庫数 | 発注点 | 最大在庫 |
| KPI 管理 | 達成率 | 目標下限 | （上限なし＝片側規格） |

---

## 設計上の注意

- **判定は必ず純粋関数に集約する**: `judgeThreshold` を UI に散らさず 1 か所に置く。フォーム・一覧・集計で判定がズレる事故を防ぎ、テストも 1 ファイルで済む。色クラス・ラベルも結果に含めると呼び出し側が分岐不要になる。
- **片側規格を最初から想定する**: `min`/`max` を独立に null 許容にする。「加熱は下限だけ」「KPI は目標下限だけ」が自然に書ける。両方 null なら常に「適合」（＝基準未設定の記録扱い）。
- **負値・氷点下に対応する**: 温度は -18℃ 等を扱うため、Dataverse の Decimal 列は `MinValue` を負値にし、ゲージの軸計算も `Math.abs` で片側レンジを取る。`MinValue:0`（既定）のままだと冷凍の基準が登録できない。
- **"未測定"（none）を "適合"（ok）と区別する**: value 未入力を ok に倒すと、未記録が「合格」に化ける。`none` を独立状態にしてグレー表示する。
- **ゲージ軸に余白（pad）を取る**: 逸脱時にマーカーが帯の外へ出る様子を見せるため、表示レンジは基準の外側に 25% ほど広げる。`pct()` は 0〜100% にクランプし、大きく外れた値でもバーからはみ出さない。
- **判定基準（min/max）はマスタ側に持つ**: しきい値を測定レコードではなく点検項目マスタに持たせると、基準変更が過去記録の再判定に反映される（記録時点の基準を凍結したい規制業務では、あえて測定側にコピーする設計もある）。
