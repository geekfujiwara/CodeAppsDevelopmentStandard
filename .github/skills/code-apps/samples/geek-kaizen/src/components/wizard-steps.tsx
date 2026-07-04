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
