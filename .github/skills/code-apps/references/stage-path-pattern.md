# ステージ矢羽（Stage Path / Chevron）パターン

商談ステージ・リードステータス・案件進捗など、**順序を持つ選択肢（OptionSet）を Salesforce 風の矢羽（シェブロン）で表示し、クリックでステージを進められる**汎用コンポーネント。

- 完了済みステージ＝塗りつぶし＋チェック、現在ステージ＝強調、未到達＝グレー
- 「失注」「不認定」など否定的な終端ステージは赤系で表示（`negativeValue`）
- `onSelect` を渡すとクリックで `value` を返す（詳細画面でその場ステージ変更 → patch）。省略すると読み取り専用表示

> プレースホルダー `{prefix}` とテーブル名・OptionSet 値はプロジェクトに読み替える。コンポーネント本体はそのまま流用できる。

---

## コンポーネント本体

`src/components/stage-path.tsx`:

```tsx
import { cn } from "@/lib/utils"

export interface StagePathItem {
  value: number
  label: string
}

interface StagePathProps {
  stages: StagePathItem[]
  current?: number
  /** 失注・不認定など否定的な終端ステージの値（赤系で表示） */
  negativeValue?: number
  onSelect?: (value: number) => void
  className?: string
}

/**
 * Salesforce 風のステージ矢羽（パス）表示。
 * 完了済みステージは塗りつぶし、現在ステージは強調、未到達はグレー。
 */
export function StagePath({ stages, current, negativeValue, onSelect, className }: StagePathProps) {
  const currentIndex = stages.findIndex((s) => s.value === current)
  const isNegative = current !== undefined && current === negativeValue

  return (
    <div className={cn("flex w-full overflow-x-auto", className)}>
      {stages.map((stage, idx) => {
        const isCurrent = idx === currentIndex
        const isCompleted = currentIndex >= 0 && idx < currentIndex
        const isLastNegative = isNegative && stage.value === negativeValue

        let toneClass: string
        if (isLastNegative) {
          toneClass = "bg-rose-600 text-white"
        } else if (isCurrent) {
          toneClass =
            negativeValue !== undefined && idx === stages.length - 1
              ? "bg-emerald-700 text-white"
              : "bg-emerald-600 text-white"
        } else if (isCompleted) {
          toneClass = "bg-emerald-500/90 text-white"
        } else {
          toneClass = "bg-muted text-muted-foreground"
        }

        // 矢羽形状（先頭セルは左ノッチなし、それ以降は左右にノッチ）
        const clip =
          idx === 0
            ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
            : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)"

        return (
          <button
            key={stage.value}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(stage.value)}
            style={{ clipPath: clip, marginLeft: idx === 0 ? 0 : -10 }}
            className={cn(
              "relative flex h-9 min-w-[96px] flex-1 items-center justify-center px-4 text-xs font-medium whitespace-nowrap transition-colors",
              toneClass,
              onSelect && "cursor-pointer hover:brightness-110",
              isCurrent && "font-semibold",
            )}
            title={stage.label}
          >
            <span className="flex items-center gap-1">
              {(isCompleted || (isCurrent && !isLastNegative)) && (
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 8.5l3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {stage.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

---

## 使い方（詳細画面でその場ステージ変更）

`types` 側の OptionSet ラベル定義（プロジェクトの値に置き換え）:

```typescript
export enum OpportunityStage { Prospect = 100000000, Proposal = 100000001, Negotiation = 100000002, Won = 100000003, Lost = 100000004 }
export const opportunityStageLabels: Record<OpportunityStage, string> = {
  [OpportunityStage.Prospect]: "見込み", [OpportunityStage.Proposal]: "提案",
  [OpportunityStage.Negotiation]: "交渉", [OpportunityStage.Won]: "受注", [OpportunityStage.Lost]: "失注",
}
```

詳細画面:

```tsx
import { StagePath } from "@/components/stage-path"
import { opportunityStageLabels } from "@/types"

// ラベル定義から矢羽アイテムを生成
const stagePathItems = Object.entries(opportunityStageLabels).map(([k, v]) => ({ value: Number(k), label: v }))

const handleStageSelect = async (stage: number) => {
  // OptionSet を直接 patch（楽観更新でもよい）
  await updateOpportunity.mutateAsync({ id, body: { {prefix}_stage: stage } })
  toast.success(`ステージを「${(opportunityStageLabels as Record<number, string>)[stage]}」に変更しました`)
}

<StagePath
  stages={stagePathItems}
  current={opportunity.{prefix}_stage}
  negativeValue={100000004 /* 失注 */}
  onSelect={handleStageSelect}
/>
```

---

## 設計上の注意

- **TS7053（number index）対策**: `opportunityStageLabels[stage]` を number で引くと型エラーになる。`(opportunityStageLabels as Record<number, string>)[stage]` でキャストする。
- **`negativeValue`**: 否定的終端（失注・不認定）を矢羽の最後に並べ、選択時のみ赤表示。完了チェックは付けない。
- **読み取り専用**: `onSelect` を省略すると `disabled` ボタンとなり、一覧やカードのステータス可視化にも使える。
- **クリックでステージ変更 → 通知フロー**: `onSelect` の patch を Power Automate（OptionSet 変更トリガー）と組み合わせると、ステージ変更時のメール通知などを自動化できる（[フロー連携](flow-integration.md)）。
