import type { ReactNode } from "react"
import { Wrench } from "lucide-react"

// このアプリから agent プロジェクト リポジトリへは直接アクセスできないため、更新はいずれも手動でのファイル反映が前提。
export function UpdateNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
      <Wrench className="mt-0.5 size-3.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">更新方法</p>
        {children}
      </div>
    </div>
  )
}
