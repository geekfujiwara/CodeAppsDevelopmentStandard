import { Bot, Cpu, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Markdown } from "@/components/markdown"
import { UpdateNote } from "@/components/update-note"
import { AGENT_PROFILE, AGENT_RESOURCE_GROUPS } from "@/data/agent-brain-resources"
import designSpecMd from "@/data/agent-design-spec.md?raw"

export default function AgentBrain() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Agent Brain 設定</h2>
        <p className="text-sm text-muted-foreground">
          「このエージェント」（Agent Brain）がどのようなリソースを使い、どう設定されているかを、実装（agent プロジェクト）を基に
          まとめた参照ページです。ここは静的な写しであり、実際の値は各リソースの設定によります。
        </p>
      </div>

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
              <code className="font-mono">meena-eval-app/src/data/agent-brain-resources.ts</code> の{" "}
              <code className="font-mono">AGENT_RESOURCE_GROUPS</code> を合わせて編集し、再デプロイしてください。
            </p>
          </UpdateNote>
          {AGENT_RESOURCE_GROUPS.map((group) => (
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
              <code className="font-mono">meena-eval-app/src/data/agent-brain-resources.ts</code> の{" "}
              <code className="font-mono">AGENT_PROFILE</code> を合わせて編集し、再デプロイしてください。
            </p>
          </UpdateNote>
          <Card>
            <CardHeader>
              <CardTitle>{AGENT_PROFILE.displayName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                システムプロンプトの読み込み元:{" "}
                <code className="font-mono text-xs">{AGENT_PROFILE.systemPromptFile}</code>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">既定のシステムプロンプト</p>
                <p className="mt-1 rounded-md border bg-muted/40 p-3 text-sm">
                  {AGENT_PROFILE.defaultSystemPrompt}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">既定の挨拶</p>
                <p className="mt-1 rounded-md border bg-muted/40 p-3 text-sm">{AGENT_PROFILE.defaultGreeting}</p>
              </div>
              <div className="space-y-1">
                {AGENT_PROFILE.notes.map((note) => (
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
              <code className="font-mono">agent プロジェクト/docs/mina-design-spec.md</code> を直してから、その内容を{" "}
              <code className="font-mono">meena-eval-app/src/data/agent-design-spec.md</code> へ再コピーし、
              再デプロイしてください。
            </p>
          </UpdateNote>
          <ScrollArea className="h-[calc(100dvh-19rem)] rounded-lg border bg-card">
            <div className="p-5">
              <Markdown>{designSpecMd}</Markdown>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
