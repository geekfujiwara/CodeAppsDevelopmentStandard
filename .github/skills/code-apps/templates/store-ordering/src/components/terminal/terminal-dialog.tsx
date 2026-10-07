import { useEffect, useRef, type ReactNode } from "react"

type DialogProps = {
  title: string
  icon?: "q" | "w" | "i"
  wide?: boolean
  children: ReactNode
  actions: { label: string; onClick: () => void; primary?: boolean; disabled?: boolean }[]
  onClose: () => void
}

/** 古い業務端末風のダイアログ。Esc で閉じ、最初のボタンにフォーカスする */
export function TerminalDialog({ title, icon, wide, children, actions, onClose }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const primary = ref.current?.querySelector<HTMLButtonElement>("[data-primary='true']") ?? ref.current?.querySelector("button")
    primary?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  return (
    <div className="t-overlay" role="presentation">
      <div ref={ref} className={`t-dialog${wide ? " t-dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="t-titlebar">
          <span>{title}</span>
          <span className="t-titlebar-btns">
            <span aria-hidden="true">×</span>
          </span>
        </div>
        <div className="t-dialog-body">
          {icon && <div className={`t-dialog-icon t-${icon}`} aria-hidden="true">{icon === "q" ? "?" : icon === "w" ? "!" : "i"}</div>}
          {children}
        </div>
        <div className="t-dialog-actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`t-btn${a.primary ? " t-btn-primary" : ""}`}
              data-primary={a.primary ? "true" : undefined}
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
