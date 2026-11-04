import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function DataLoadError({
  onRetry,
  message = "データを読み込めませんでした。接続を確認して再試行してください。",
}: {
  onRetry: () => void
  message?: string
}) {
  return (
    <Card role="alert" className="border-destructive/40">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="max-w-xl text-sm text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          再読み込み
        </Button>
      </CardContent>
    </Card>
  )
}
