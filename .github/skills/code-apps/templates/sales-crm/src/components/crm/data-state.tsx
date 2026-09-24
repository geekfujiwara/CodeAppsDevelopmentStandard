import type { ReactNode } from "react"
import { AlertTriangle, PlugZap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataSourceMissingError } from "@/lib/dataverse-client"

interface DataStateProps {
  isLoading: boolean
  error: unknown
  children: ReactNode
}

export function DataState({ isLoading, error, children }: DataStateProps) {
  if (error instanceof DataSourceMissingError) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex gap-4 py-6">
          <PlugZap className="h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0 space-y-2 text-sm">
            <p className="font-semibold">Dataverse がまだ接続されていません</p>
            <p className="text-muted-foreground">初回デプロイは完了しています。次のコマンドでデータソースを追加し、再デプロイしてください。</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
{`python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse \\
  --connection-ref $CONNECTION_REFERENCE_LOGICAL_NAME --solution-id $SOLUTION_ID
npm run deploy`}
            </pre>
          </div>
        </CardContent>
      </Card>
    )
  }
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex gap-3 py-6 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="min-w-0 [overflow-wrap:anywhere]">データを読み込めませんでした: {error instanceof Error ? error.message : String(error)}</p>
        </CardContent>
      </Card>
    )
  }
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 min-w-0" />)}
      </div>
    )
  }
  return <>{children}</>
}
