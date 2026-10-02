import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CODEAPPS_APP_NAME } from "@/config"

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{CODEAPPS_APP_NAME}</h1>
        <p className="text-muted-foreground">ダッシュボード</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ここから実装を始める</CardTitle>
          <CardDescription>
            汎用ベーステンプレートのプレースホルダーページです。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. 業務ページを <code>src/pages/</code> に追加する</p>
          <p>2. <code>src/config.ts</code> の NAV_SECTIONS / ICON_MAP と <code>src/router.tsx</code> に同じ path で登録する</p>
          <p>3. <code>npm run predeploy</code> でナビとルートの整合を確認する</p>
        </CardContent>
      </Card>
    </div>
  )
}
