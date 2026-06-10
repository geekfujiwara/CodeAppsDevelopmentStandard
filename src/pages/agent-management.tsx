import { useBots, useConversationSummaries } from "@/hooks/use-copilot-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { useMemo } from "react";

export default function AgentManagement() {
  const { data: bots, isLoading: botsLoading } = useBots();
  const { data: summaries, isLoading: sumLoading } = useConversationSummaries();

  const agentStats = useMemo(() => {
    if (!bots || !summaries) return [];
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

  if (botsLoading || sumLoading) return <LoadingSkeletonCard count={4} />;

  const published = agentStats.filter((a) => a.publishedon);
  const activeCount = agentStats.filter((a) => a.conversationCount > 0).length;
  const dormant = published.filter((a) => a.conversationCount === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">エージェント管理</h1>
        <p className="text-muted-foreground">環境内の全エージェントを棚卸し・ガバナンス管理</p>
      </div>

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

      {dormant.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-sm text-amber-700 dark:text-amber-400">棚卸し推奨：公開済み・会話0件のエージェント</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {dormant.map((a) => (
                <li key={a.botid} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">未使用</Badge>
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground">（公開: {a.publishedon?.slice(0, 10)}）</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">全エージェント一覧</CardTitle>
        </CardHeader>
        <CardContent>
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
                {agentStats.map((a) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
