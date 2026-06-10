import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CODEAPPS_APP_NAME } from "@/config";

/**
 * テンプレート ダッシュボード（プレースホルダー）
 *
 * テーマ開発時にこのファイルを書き換えて、テーマ固有のダッシュボードを実装する。
 * Dataverse データの表示には use-dataverse.ts のフックと
 * services/dataverse-service.ts のサービス層を使用する。
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{CODEAPPS_APP_NAME}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              セットアップ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              テンプレートの初回デプロイが完了しました。
              <br />
              GeekPowerCode エージェントにテーマを伝えて開発を開始してください。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
