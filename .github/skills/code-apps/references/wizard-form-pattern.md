# ウィザードフォームパターン（複数ステップ入力）

入力項目が多いレコード作成（申請・オンボーディング・見積作成など）を**ステップに分割して順に入力させる**パターン。
1 画面に 15 項目以上並ぶフォームは離脱率が上がるため、意味のまとまりごとに 3〜4 ステップへ分割する。

- ステップインジケーター（番号チップ + ラベル + 進捗線）で現在位置を可視化
- ステップごとにバリデーションし、不合格なら次へ進めない
- 最終ステップは**確認画面**（入力サマリー）にして保存前に見直しできるようにする
- 状態は 1 つの `formData` に集約し、保存時にまとめて Dataverse へ送る（途中保存はしない）

> 3 ステップ未満・10 項目未満なら通常の [FormModal + FormColumns](component-catalog.md) で十分。
> ウィザードは「分ける価値がある長さ」のときだけ使う。

---

## ステップインジケーター

`src/components/wizard-steps.tsx`:

```tsx
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1">
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                done && "bg-primary text-primary-foreground",
                active && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                !done && !active && "bg-muted text-muted-foreground",
              )}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn(
                "whitespace-nowrap text-[11px]",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("mx-2 mb-4 h-0.5 flex-1 rounded", done ? "bg-primary" : "bg-muted")} />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

---

## 使い方（FormModal と組み合わせる）

ステップ本体は `FormModal` の `children` を `step` で出し分け、フッターは `footer` プロパティで
「戻る / 次へ / 保存」に差し替える。

```tsx
const STEPS = ["基本情報", "詳細", "確認"]
const [step, setStep] = useState(0)

/** ステップごとの必須チェック。不合格なら toast を出して false */
const validateStep = (s: number): boolean => {
  if (s === 0 && !formData.name.trim()) { toast.error("件名は必須です"); return false }
  if (s === 1 && !formData.category.trim()) { toast.error("種別は必須です"); return false }
  return true
}

const handleNext = () => { if (validateStep(step)) setStep(s => s + 1) }
const handleOpen = () => { setFormData(EMPTY_FORM); setStep(0); setIsFormOpen(true) }

<FormModal
  open={isFormOpen}
  onOpenChange={setIsFormOpen}
  title="新規申請"
  maxWidth="2xl"
  footer={
    <div className="flex w-full items-center justify-between">
      <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>戻る</Button>
      {step < STEPS.length - 1 ? (
        <Button onClick={handleNext}>次へ</Button>
      ) : (
        <Button onClick={handleSave} disabled={isSaving}>保存</Button>
      )}
    </div>
  }
>
  <div className="space-y-6">
    <WizardSteps steps={STEPS} current={step} />

    {step === 0 && (
      <FormColumns columns={2}>{/* 基本情報の入力項目 */}</FormColumns>
    )}
    {step === 1 && (
      <FormColumns columns={2}>{/* 詳細の入力項目 */}</FormColumns>
    )}
    {step === 2 && (
      /* 確認ステップ: 入力値を読み取り専用で一覧表示 */
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">件名</dt><dd className="font-medium">{formData.name}</dd>
        <dt className="text-muted-foreground">種別</dt><dd>{formData.category}</dd>
        {/* ...全項目 */}
      </dl>
    )}
  </div>
</FormModal>
```

---

## 設計上の注意

- **ステップ間で state を捨てない**: `formData` は全ステップ共通の 1 オブジェクト。戻っても入力が残る。
- **編集時もウィザードを使うか**: 編集は全項目を見渡したいことが多いため、新規=ウィザード / 編集=通常フォームの併用が実務的。判定は `editingId` の有無で分岐する。
- **確認ステップは必ず入れる**: 保存後に編集で直せるとしても、送信系（申請・注文）は確認ステップがあると誤送信の心理的抵抗が下がる。
- **モーダルを閉じたら step をリセット**: `onOpenChange` で `false` のとき `setStep(0)` を忘れると、次回開いたときに途中ステップから始まる。
- **キーボード操作**: 「次へ」は `type="button"` にする（Enter キーでフォーム submit が走って意図せず進むのを防ぐ）。
