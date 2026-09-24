import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { openGuide } from "@/crm/guide"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <Button variant="ghost" size="sm" onClick={openGuide} data-tour="guide">
          <HelpCircle className="h-4 w-4" />使い方
        </Button>
      </div>
    </div>
  )
}
