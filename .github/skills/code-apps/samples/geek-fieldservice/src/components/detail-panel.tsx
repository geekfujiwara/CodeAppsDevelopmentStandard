import { type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, Pencil, Save, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  title: string
  isEditing: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  isSaving?: boolean
  viewContent: ReactNode
  editContent: ReactNode
}

export function DetailPanel({
  open,
  onClose,
  title,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  isSaving = false,
  viewContent,
  editContent,
}: DetailPanelProps) {
  if (!open) return null

  return (
    <div className="w-[380px] shrink-0 border-l border-border bg-background flex flex-col h-[calc(100vh-8rem)] sticky top-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
        <h3 className="font-semibold text-foreground truncate pr-2">{title}</h3>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <Button variant="ghost" size="icon-sm" onClick={onEdit} title="編集">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="閉じる">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {isEditing ? editContent : viewContent}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 shrink-0">
        {isEditing ? (
          <>
            <div>
              {onDelete && (
                <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive gap-1">
                  <Trash2 className="h-3.5 w-3.5" />削除
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>キャンセル</Button>
              <Button size="sm" onClick={onSave} disabled={isSaving} className="gap-1">
                <Save className="h-3.5 w-3.5" />{isSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              {onDelete && (
                <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive gap-1">
                  <Trash2 className="h-3.5 w-3.5" />削除
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1">
              <Pencil className="h-3.5 w-3.5" />編集
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

export function DetailGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 }) {
  return (
    <dl className={cn("grid gap-4", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {children}
    </dl>
  )
}
