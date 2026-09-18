import { Bot, Cpu, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentSwitcher, useSelectedAgent } from "@/components/agent-switcher"
import { Markdown } from "@/components/markdown"
import { UpdateNote } from "@/components/update-note"
import { getAgentBrain } from "@/data/agent-brain-resources"
import { getDesignSpec } from "@/data/agent-design-specs"

export default function AgentBrain() {
  const { agents, agent, agentKey, setAgentKey } = useSelectedAgent()
  const { profile, resourceGroups, isShared } = getAgentBrain(agentKey)
  const designSpec = getDesignSpec(agentKey)
  // マスターに登録された表示名・役割を優先する（静的な写しは実装側の既定値）。
  const displayName = agent?.name || profile.displayName

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Agent Brain 設定</h2>
        <p className="text-sm text-muted-foreground">
          選んだ AI チームメイト（Agent Brain）がどのようなリソースを使い、どう設定されているかを、実装（agent プロジェクト）を基に
          まとめた参照ページです。ここは静的な写しであり、実際の値は各リソースの設定によります。
        </p>
      </div>

      <AgentSwitcher agents={agents} agent={agent} onChange={setAgentKey} />

      <Tabs defaultValue="resources">
        <TabsList>
          <TabsTrigger value="resources">
            <Cpu className="size-4" />
            リソース構成
          </TabsTrigger>
          <TabsTrigger value="persona">
            <Bot className="size-4" />
            ペルソナ
          </TabsTrigger>
          <TabsTrigger value="design">
            <Info className="size-4" />
            設計ドキュメント
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resources" className="space-y-4">
          <UpdateNote>
            <p>
              <code className="font-mono">agent プロジェクト/AgentBrain.cs</code> と{" "}
              <code className="font-mono">agent プロジェクト/appsettings.json</code> でリソースや設定キーを変更したら、
              <code className="font-mono">evaluation-app/src/data/agent-brain-resources.ts</code> の{" "}
              <code className="font-mono">AGENT_RESOURCE_GROUPS</code> を合わせて編集し、再デプロイしてください。
              チームメイトごとに実装が違う場合は、同じファイルの{" "}
              <code className="font-mono">AGENT_BRAIN_OVERRIDES</code> にエージェントキーで差分を登録します。
            </p>
          </UpdateNote>
          {isShared && <SharedDesignNote name={displayName} />}
          {resourceGroups.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {group.resources.map((resource) => (
                  <div key={resource.name} className="rounded-lg border p-3">
                    <p className="font-medium">{resource.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{resource.purpose}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {resource.configKeys.map((key) => (
                        <Badge key={key} variant="outline" className="font-mono text-[10px] font-normal">
                          {key}
                        </Badge>
                      ))}
                    </div>
                    {resource.tools && resource.tools.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">ブロック済みツール:</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {resource.tools.map((tool) => (
                            <Badge key={tool} variant="secondary" className="font-mono text-[10px] font-normal">
                              {tool}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {resource.notes?.map((note) => (
                      <p key={note} className="mt-2 text-xs text-muted-foreground">
                        {note}
                      </p>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="persona" className="space-y-4">
          <UpdateNote>
            <p>
              <code className="font-mono">agent プロジェクト/prompts/system.md</code>（実運用のシステムプロンプト）または{" "}
              <code className="font-mono">agent プロジェクト/AgentPrompt.cs</code> の既定値を変更したら、
              <code className="font-mono">evaluation-app/src/data/agent-brain-resources.ts</code> の{" "}
              <code className="font-mono">AGENT_PROFILE</code>（チームメイト個別なら{" "}
              <code className="font-mono">AGENT_BRAIN_OVERRIDES</code>）を合わせて編集し、再デプロイしてください。
            </p>
          </UpdateNote>
          <Card>
            <CardHeader>
              <CardTitle>{displayName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                システムプロンプトの読み込み元:{" "}
                <code className="font-mono text-xs">{profile.systemPromptFile}</code>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {agent?.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">マスターに登録された役割</p>
                  <p className="mt-1 rounded-md border bg-muted/40 p-3 text-sm">{agent.description}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground">既定のシステムプロンプト</p>
                <p className="mt-1 rounded-md border bg-muted/40 p-3 text-sm">
                  {profile.defaultSystemPrompt}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">既定の挨拶</p>
                <p className="mt-1 rounded-md border bg-muted/40 p-3 text-sm">{profile.defaultGreeting}</p>
              </div>
              <div className="space-y-1">
                {profile.notes.map((note) => (
                  <p key={note} className="text-xs text-muted-foreground">
                    ・{note}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design" className="space-y-4">
          <UpdateNote>
            <p>
              共通の設計ドキュメントは{" "}
              <code className="font-mono">evaluation-app/src/data/agent-design-spec.md</code> です。
              チームメイトごとに別の設計を見せたいときは{" "}
              <code className="font-mono">evaluation-app/src/data/design-specs/&lt;エージェントキー&gt;.md</code>{" "}
              を置いてから再デプロイしてください。
            </p>
          </UpdateNote>
          {designSpec.isShared && <SharedDesignNote name={displayName} />}
          <ScrollArea className="h-[calc(100dvh-19rem)] rounded-lg border bg-card">
            <div className="p-5">
              <Markdown>{designSpec.markdown}</Markdown>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// チームメイト個別の写しが無いときに、共通設計を見ていると分かるようにする。
function SharedDesignNote({ name }: { name: string }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      {name} 専用の写しが登録されていないため、セルフホストの共通設計を表示しています。
    </p>
  )
}
