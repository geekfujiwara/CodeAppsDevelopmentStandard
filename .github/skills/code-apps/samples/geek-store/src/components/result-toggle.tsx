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
