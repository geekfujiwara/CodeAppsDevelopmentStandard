import { ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AgentSwitcher, useSelectedAgent } from "@/components/agent-switcher"
import { UpdateNote } from "@/components/update-note"
import { getAgentSecurity } from "@/data/agent-security"

export default function Security() {
  const { agents, agent, agentKey, setAgentKey } = useSelectedAgent()
  const {
    defenseLayers,
    trustedTools,
    untrustedSources,
    enforcedChecks,
    operationRestrictions,
    dataAccessRules,
    informationSharingRules,
    errorBehavior,
    isShared,
  } = getAgentSecurity(agentKey)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">セキュリティ設定</h2>
        <p className="text-sm text-muted-foreground">
          プロンプト インジェクション対策、操作制限、データアクセス範囲など、選んだ AI チームメイトの安全性に関わる設計をまとめた参照ページです。
        </p>
      </div>

      <AgentSwitcher agents={agents} agent={agent} onChange={setAgentKey} />

      <UpdateNote>
        <p>
          <code className="font-mono">agent プロジェクト/UntrustedContent.cs</code> や設計仕様（安全性とガードレール章）を変更したら、
          <code className="font-mono">evaluation-app/src/data/agent-security.ts</code> を合わせて編集し、再デプロイしてください。
          チームメイトごとにガードレールが違う場合は、同じファイルの{" "}
          <code className="font-mono">AGENT_SECURITY_OVERRIDES</code> にエージェントキーで差分を登録します。
        </p>
      </UpdateNote>

      {isShared && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {agent?.name || "このチームメイト"} 専用の写しが登録されていないため、セルフホストの共通設計を表示しています。
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" />
            プロンプト インジェクション対策（4 層防御）
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            外部から取り込んだ文章は指示ではなくデータとして扱う。L1〜L3 はモデルの遵守に依存するため単独では破られ得るので、
            決め手となる L4（実装によるコード側の検証）を必ず入れる。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {defenseLayers.map((layer) => (
            <div key={layer.layer} className="rounded-lg border p-3">
              <p className="font-medium">{layer.layer}</p>
              <p className="mt-1 text-sm text-muted-foreground">{layer.action}</p>
              <p className="mt-1 text-xs text-muted-foreground">破られたときの影響: {layer.ifBroken}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>信頼するツール（許可リスト）</CardTitle>
            <p className="text-sm text-muted-foreground">
              自分のアプリが文面を組み立てているツールだけを許可リストに入れ、それ以外はすべて外部データとしてフェンスで囲む。
              新しいツールを足しても既定で保護される。
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {trustedTools.map((tool) => (
                <Badge key={tool} variant="secondary" className="font-mono text-[10px] font-normal">
                  {tool}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>外部データの入口</CardTitle>
            <p className="text-sm text-muted-foreground">
              第三者が内容を自由に書ける入口。許可リスト外のツール結果として、フェンスで囲んでから会話に渡す。
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {untrustedSources.map((item) => (
              <div key={item.source} className="rounded-lg border p-3">
                <p className="font-medium">{item.source}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>実害のある操作の強制チェック（L4）</CardTitle>
          <p className="text-sm text-muted-foreground">
            送信・共有・実行のような取り返しのつかない操作は、プロンプトの外側（アプリのコード）で認証済み ID を検証してから通す。
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>操作</TableHead>
                <TableHead>コードで確認すること</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enforcedChecks.map((row) => (
                <TableRow key={row.operation}>
                  <TableCell className="font-medium">{row.operation}</TableCell>
                  <TableCell className="text-muted-foreground">{row.check}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>操作制限</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {operationRestrictions.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>エラー時の振る舞い</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {errorBehavior.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>データ主体とアクセス範囲</CardTitle>
          <p className="text-sm text-muted-foreground">
            エージェントがツールで「私（/me）」を参照した場合、対象はエージェント自身のアカウントであり、話しかけている利用者のアカウントではない。
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>データ</TableHead>
                <TableHead>参照可否</TableHead>
                <TableHead>備考</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataAccessRules.map((row) => (
                <TableRow key={row.data}>
                  <TableCell className="font-medium">{row.data}</TableCell>
                  <TableCell>{row.access}</TableCell>
                  <TableCell className="text-muted-foreground">{row.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>情報共有ルール</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {informationSharingRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
