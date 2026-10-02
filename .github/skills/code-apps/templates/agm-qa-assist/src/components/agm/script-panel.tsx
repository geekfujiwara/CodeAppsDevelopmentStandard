import { useEffect, useRef } from "react"
import type { ScriptLine } from "@/hooks/use-rehearsal"

const ROLE: Record<ScriptLine["role"], { label: string; className: string }> = {
  chair: { label: "議長", className: "text-agm-muted" },
  shareholder: { label: "株主", className: "text-agm-accent" },
  officer: { label: "回答", className: "text-agm-ok" },
}

/** リハーサル台本。人が読み上げるときのプロンプター、Windows の読み上げ中は今読んでいる行を示す */
export function ScriptPanel({ lines, currentId }: { lines: ScriptLine[]; currentId: string | null }) {
  const refs = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (currentId) refs.current.get(currentId)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [currentId])
  return (
    <ol className="agm-scroll h-full space-y-1 overflow-y-auto px-4 py-2" data-testid="script">
      {lines.map((line) => {
        const role = ROLE[line.role]
        const current = line.id === currentId
        return (
          <li
            key={line.id}
            ref={(el) => {
              if (el) refs.current.set(line.id, el)
            }}
            className={`flex min-w-0 gap-3 rounded-md px-2 py-1 text-sm leading-6 ${current ? "bg-agm-raised ring-1 ring-agm-accent" : ""}`}
          >
            <span className="w-8 shrink-0 font-mono text-[11px] text-agm-muted">{line.id}</span>
            <span className={`w-28 shrink-0 truncate text-xs font-semibold ${role.className}`} title={line.speaker}>
              {role.label}・{line.speaker.replace(/^株主\s*/, "")}
            </span>
            <span className="min-w-0">{line.text}</span>
          </li>
        )
      })}
    </ol>
  )
}
