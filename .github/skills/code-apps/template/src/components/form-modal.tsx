import { type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface FormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full"
  showExport?: boolean
  onExport?: () => void
  onCancel?: () => void
  onSave?: () => void
  saveLabel?: string
  cancelLabel?: string
  isSaving?: boolean
}

export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  maxWidth = "2xl",
  showExport = false,
  onExport,
  onCancel,
  onSave,
  saveLabel = "保存",
  cancelLabel = "キャンセル",
  isSaving = false,
}: FormModalProps) {
  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  const handleSave = () => {
    onSave?.()
  }

  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    full: "max-w-[90vw]",
  }[maxWidth]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 max-h-[90vh] flex flex-col",
          maxWidthClass
        )}
      >
        {/* ヘッダー */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-primary/10 flex-shrink-0">
          <div className="flex-1 space-y-1.5">
            <DialogTitle className="text-xl font-semibold text-foreground">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        {/* スクロール可能なコンテンツエリア */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-6">
            {children}
          </div>
        </ScrollArea>

        {/* フッター */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          {footer || (
            <div className="flex items-center justify-between w-full gap-3">
              <div>
                {showExport && (
                  <Button
                    variant="outline"
                    onClick={onExport}
                    className="gap-2"
                  >
                    <span className="text-lg">📥</span>
                    エクスポート
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  {cancelLabel}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <span className="text-lg">💾</span>
                  {saveLabel}
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// フォーム内のカラムレイアウト用コンポーネント
interface FormColumnsProps {
  children: ReactNode
  columns?: 1 | 2 | 3
  className?: string
}

export function FormColumns({ children, columns = 2, className }: FormColumnsProps) {
  const gridClass = {
    1: "grid-cols-1",
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
  }[columns]

  return (
    <div className={cn("grid gap-6", gridClass, className)}>
      {children}
    </div>
  )
}

// フォームセクション用コンポーネント
interface FormSectionProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
