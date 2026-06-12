import { useBots, useConversationSummaries } from "@/hooks/use-copilot-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { useMemo } from "react";

function AgentTable({ agents }: { agents: AgentStat[] }) {
  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">該当するエージェントはありません</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3">名前</th>
            <th className="py-2 pr-3">状態</th>
            <th className="py-2 pr-3 text-right">会話数</th>
            <th className="py-2 pr-3 text-right">解決率</th>
            <th className="py-2 pr-3">最終利用</th>
            <th className="py-2">公開日</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.botid} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium max-w-[250px] truncate" title={a.name}>{a.name}</td>
              <td className="py-2 pr-3">
                <Badge variant={a.publishedon ? "default" : "secondary"} className="text-xs">
                  {a.publishedon ? "公開" : "下書き"}
                </Badge>
              </td>
              <td className="py-2 pr-3 text-right">{a.conversationCount}</td>
              <td className="py-2 pr-3 text-right">
                {a.resolveRate !== null ? (
                  <Badge variant={a.resolveRate >= 80 ? "default" : "destructive"} className="text-xs">
                    {a.resolveRate.toFixed(0)}%
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{a.lastUsed?.slice(0, 10) ?? "—"}</td>
              <td className="py-2 text-muted-foreground">{a.publishedon?.slice(0, 10) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type AgentStat = {
  botid: string;
  name: string;
  publishedon: string | null;
  conversationCount: number;
  resolveRate: number | null;
  lastUsed: string | null;
};

function useAgentStats() {
  const { data: bots, isLoading: botsLoading } = useBots();
  const { data: summaries, isLoading: sumLoading } = useConversationSummaries();

  const agentStats = useMemo(() => {
    if (!bots || !summaries) return [] as AgentStat[];
    const statsMap: Record<string, { count: number; resolved: number; lastUsed: string | null }> = {};
    for (const s of summaries) {
      const bid = s.geek_botid;
      if (!statsMap[bid]) statsMap[bid] = { count: 0, resolved: 0, lastUsed: null };
      statsMap[bid].count++;
      if (s.geek_outcome === 100000000) statsMap[bid].resolved++;
      if (!statsMap[bid].lastUsed || s.geek_starttime > statsMap[bid].lastUsed!) {
        statsMap[bid].lastUsed = s.geek_starttime;
      }
    }
    return bots.map((b) => {
      const s = statsMap[b.botid] ?? { count: 0, resolved: 0, lastUsed: null };
      return {
        ...b,
        conversationCount: s.count,
        resolveRate: s.count > 0 ? (s.resolved / s.count * 100) : null,
        lastUsed: s.lastUsed,
      };
    });
  }, [bots, summaries]);

  return { agentStats, isLoading: botsLoading || sumLoading };
}

export default function AgentManagement() {
  const { agentStats, isLoading } = useAgentStats();

  if (isLoading) return <LoadingSkeletonCard count={4} />;

  const published = agentStats.filter((a) => a.publishedon);
  const activeCount = agentStats.filter((a) => a.conversationCount > 0).length;
  const dormant = published.filter((a) => a.conversationCount === 0);
  const drafts = agentStats.filter((a) => !a.publishedon);
  const ranked = [...agentStats].sort((a, b) => b.conversationCount - a.conversationCount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">エージェント管理</h1>
        <p className="text-muted-foreground">環境内の全エージェントを棚卸し・ガバナンス管理</p>
      </div>

      <Tabs defaultValue="kpi" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kpi">KPIカード</TabsTrigger>
          <TabsTrigger value="all">全エージェント</TabsTrigger>
          <TabsTrigger value="inventory">
            棚卸{dormant.length > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">{dormant.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="drafts">
            下書き{drafts.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{drafts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ranking">利用ランキング</TabsTrigger>
        </TabsList>

        {/* KPIカード */}
        <TabsContent value="kpi" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">総エージェント</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{agentStats.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">公開済み</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{published.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">利用実績あり</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{activeCount}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">公開済み未使用</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-amber-500">{dormant.length}</div></CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">下書き</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-muted-foreground">{drafts.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">平均解決率</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(() => {
                    const rates = agentStats.filter((a) => a.resolveRate !== null).map((a) => a.resolveRate!);
                    return rates.length > 0 ? `${(rates.reduce((s, v) => s + v, 0) / rates.length).toFixed(0)}%` : "—";
                  })()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">総会話数</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{agentStats.reduce((s, a) => s + a.conversationCount, 0)}</div></CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 全エージェント */}
        <TabsContent value="all">
          <Card>
            <CardHeader><CardTitle className="text-sm">全エージェント一覧</CardTitle></CardHeader>
            <CardContent>
              <AgentTable agents={agentStats} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 棚卸 */}
        <TabsContent value="inventory" className="space-y-4">
          {dormant.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                  棚卸し推奨：公開済み・会話0件のエージェント（{dormant.length}件）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AgentTable agents={dormant} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                棚卸し対象のエージェントはありません
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 下書き */}
        <TabsContent value="drafts">
          <Card>
            <CardHeader><CardTitle className="text-sm">未公開（下書き）エージェント</CardTitle></CardHeader>
            <CardContent>
              <AgentTable agents={drafts} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 利用ランキング */}
        <TabsContent value="ranking">
          <Card>
            <CardHeader><CardTitle className="text-sm">利用ランキング（会話数順）</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 w-10">#</th>
                      <th className="py-2 pr-3">名前</th>
                      <th className="py-2 pr-3 text-right">会話数</th>
                      <th className="py-2 pr-3 text-right">解決率</th>
                      <th className="py-2">最終利用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((a, i) => (
                      <tr key={a.botid} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-bold text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-3 font-medium max-w-[250px] truncate" title={a.name}>{a.name}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{a.conversationCount}</td>
                        <td className="py-2 pr-3 text-right">
                          {a.resolveRate !== null ? (
                            <Badge variant={a.resolveRate >= 80 ? "default" : "destructive"} className="text-xs">
                              {a.resolveRate.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 text-muted-foreground">{a.lastUsed?.slice(0, 10) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
