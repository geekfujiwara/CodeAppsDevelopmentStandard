import { Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

export function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
    </div>
  )
}

export type DetailPanelProps = {
  title: string
  description: string
  onClose: () => void
  onDelete?: () => void
  onSave: () => void
  isSaving: boolean
  children: React.ReactNode
}

/** 一覧の直上に開くインライン詳細。モーダルにしないことで一覧との対応関係を保つ */
export function DetailPanel({
  title,
  description,
  onClose,
  onDelete,
  onSave,
  isSaving,
  children,
}: DetailPanelProps) {
  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="詳細を閉じる">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            {onDelete && (
              <Button variant="outline" onClick={onDelete} disabled={isSaving} className="text-destructive">
                <Trash2 className="mr-1 h-4 w-4" />削除
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>キャンセル</Button>
            <Button onClick={onSave} disabled={isSaving}>{isSaving ? "保存中..." : "保存"}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
