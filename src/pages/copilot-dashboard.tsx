import { useMemo, useState } from "react";
import { useConversationSummaries, useBots, useRefreshSummaries } from "@/hooks/use-copilot-analytics";
import { OUTCOME_LABELS, OUTCOME_COLORS } from "@/types/copilot-analytics";
import type { ConversationSummary } from "@/types/copilot-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { ConversationChatDialog } from "@/components/conversation-chat-dialog";
import { ArrowUp, ArrowDown, Minus, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ── KPIカード（前週比デルタ対応） ──
function KpiCard({ title, value, sub, color, delta }: {
  title: string; value: string | number; sub?: string; color?: string;
  delta?: { value: number; label: string; inverse?: boolean };
}) {
  const deltaColor = delta
    ? delta.value === 0 ? undefined
    : (delta.value > 0) !== !!delta.inverse ? "hsl(142,76%,36%)" : "hsl(0,84%,60%)"
    : undefined;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="text-2xl font-bold" style={color ? { color } : undefined}>{value}</div>
          {delta && delta.value !== 0 && (
            <span className="flex items-center text-xs font-medium mb-0.5" style={{ color: deltaColor }}>
              {delta.value > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {Math.abs(delta.value).toFixed(0)}{delta.label}
            </span>
          )}
          {delta && delta.value === 0 && (
            <span className="flex items-center text-xs text-muted-foreground mb-0.5">
              <Minus className="size-3" /> 変化なし
            </span>
          )}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── 成果バー ──
function OutcomeBar({ data }: { data: Record<number, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-6 rounded-md overflow-hidden w-full">
      {Object.entries(data).map(([k, v]) => {
        const code = Number(k);
        const pct = (v / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={code}
            className="flex items-center justify-center text-[10px] font-medium text-white"
            style={{ width: `${pct}%`, backgroundColor: OUTCOME_COLORS[code] ?? "#888", minWidth: pct > 5 ? undefined : "20px" }}
            title={`${OUTCOME_LABELS[code] ?? code}: ${v}件 (${pct.toFixed(0)}%)`}
          >
            {pct > 10 ? `${OUTCOME_LABELS[code]} ${v}` : v}
          </div>
        );
      })}
    </div>
  );
}

// ── 日次トレンド（テキストテーブル） ──
function DailyTrend({ summaries }: { summaries: ConversationSummary[] }) {
  const byDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of summaries) {
      const d = s.geek_starttime?.slice(0, 10);
      if (d) map[d] = (map[d] ?? 0) + 1;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [summaries]);

  const max = Math.max(...byDate.map(([, v]) => v), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">日次会話トレンド</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 max-h-[300px] overflow-y-auto">
        {byDate.map(([date, count]) => (
          <div key={date} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-muted-foreground">{date.slice(5)}</span>
            <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary rounded" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="w-6 text-right font-medium">{count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── エージェント別テーブル ──
function AgentTable({ summaries }: { summaries: ConversationSummary[] }) {
  const agents = useMemo(() => {
    const map: Record<string, { count: number; resolved: number; avgDur: number; durSum: number; tools: number }> = {};
    for (const s of summaries) {
      const n = s.geek_botname || "unknown";
      if (!map[n]) map[n] = { count: 0, resolved: 0, avgDur: 0, durSum: 0, tools: 0 };
      map[n].count++;
      if (s.geek_outcome === 100000000) map[n].resolved++;
      map[n].durSum += s.geek_durationsec ?? 0;
      map[n].tools += s.geek_tooleventcount ?? 0;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v, avgDur: v.durSum / v.count, resolveRate: v.count > 0 ? (v.resolved / v.count * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [summaries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">エージェント別パフォーマンス</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">エージェント</th>
                <th className="py-2 pr-4 text-right">会話数</th>
                <th className="py-2 pr-4 text-right">解決率</th>
                <th className="py-2 pr-4 text-right">平均時間</th>
                <th className="py-2 text-right">ツール呼出</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.name} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium max-w-[200px] truncate" title={a.name}>{a.name}</td>
                  <td className="py-2 pr-4 text-right">{a.count}</td>
                  <td className="py-2 pr-4 text-right">
                    <Badge variant={a.resolveRate >= 80 ? "default" : "destructive"} className="text-xs">
                      {a.resolveRate.toFixed(0)}%
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-right">{a.avgDur.toFixed(1)}秒</td>
                  <td className="py-2 text-right">{a.tools}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── ツールサーバーランキング ──
function ToolServerRanking({ summaries }: { summaries: ConversationSummary[] }) {
  const servers = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of summaries) {
      for (const srv of (s.geek_toolservers ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
        map[srv] = (map[srv] ?? 0) + 1;
      }
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [summaries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">ツール（MCP サーバー）利用ランキング</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {servers.map(([name, count]) => (
          <div key={name} className="flex items-center justify-between text-sm">
            <span className="truncate max-w-[200px]" title={name}>{name}</span>
            <Badge variant="secondary">{count}件</Badge>
          </div>
        ))}
        {servers.length === 0 && <p className="text-sm text-muted-foreground">データなし</p>}
      </CardContent>
    </Card>
  );
}

// ── チャネル別分布 ──
function ChannelDistribution({ summaries }: { summaries: ConversationSummary[] }) {
  const channels = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of summaries) {
      const ch = s.geek_channel || "不明";
      map[ch] = (map[ch] ?? 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [summaries]);

  const total = summaries.length || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">チャネル別分布</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {channels.map(([ch, count]) => (
          <div key={ch} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{ch}</span>
              <span className="text-muted-foreground">{count}件 ({((count / total) * 100).toFixed(0)}%)</span>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary rounded" style={{ width: `${(count / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── 時間帯ヒートマップ（曜日×時間） ──
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
function HourlyHeatmap({ summaries }: { summaries: ConversationSummary[] }) {
  const grid = useMemo(() => {
    // grid[day][hour] = count
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const s of summaries) {
      if (!s.geek_starttime) continue;
      const d = new Date(s.geek_starttime);
      g[d.getDay()][d.getHours()]++;
    }
    return g;
  }, [summaries]);

  const maxVal = Math.max(1, ...grid.flat());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">時間帯別利用ヒートマップ</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={100}>
          <div className="overflow-x-auto">
            <div className="inline-grid gap-px" style={{ gridTemplateColumns: `2rem repeat(24, 1fr)` }}>
              {/* header */}
              <div />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-[9px] text-center text-muted-foreground w-5">{h}</div>
              ))}
              {/* rows */}
              {grid.map((row, day) => (
                <>
                  <div key={`d${day}`} className="text-[10px] font-medium flex items-center">{DAY_LABELS[day]}</div>
                  {row.map((v, h) => {
                    const intensity = v / maxVal;
                    return (
                      <Tooltip key={`${day}-${h}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="w-5 h-5 rounded-sm"
                            style={{
                              backgroundColor: v === 0
                                ? "hsl(var(--muted))"
                                : `hsl(142, 76%, ${80 - intensity * 50}%)`,
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {DAY_LABELS[day]} {h}:00 — {v}件
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

// ── 改善提案 ──
function ImprovementSuggestions({ summaries }: { summaries: ConversationSummary[] }) {
  const suggestions = useMemo(() => {
    const items: { level: "warn" | "info"; text: string }[] = [];

    // 解決率が低いエージェント
    const agentMap: Record<string, { total: number; resolved: number; abandoned: number }> = {};
    for (const s of summaries) {
      const n = s.geek_botname || "unknown";
      if (!agentMap[n]) agentMap[n] = { total: 0, resolved: 0, abandoned: 0 };
      agentMap[n].total++;
      if (s.geek_outcome === 100000000) agentMap[n].resolved++;
      if (s.geek_outcome === 100000001) agentMap[n].abandoned++;
    }
    for (const [name, v] of Object.entries(agentMap)) {
      if (v.total >= 2 && v.resolved / v.total < 0.8) {
        items.push({ level: "warn", text: `${name} の解決率が ${(v.resolved / v.total * 100).toFixed(0)}% と低い（${v.abandoned}件放棄）` });
      }
    }

    // 長時間会話
    const longConvos = summaries.filter((s) => s.geek_durationsec > 120);
    if (longConvos.length > 0) {
      items.push({ level: "info", text: `${longConvos.length}件の会話が2分超（ボトルネック調査推奨）` });
    }

    // ツール未活用エージェント
    const toolMap: Record<string, { total: number; withTool: number }> = {};
    for (const s of summaries) {
      const n = s.geek_botname || "unknown";
      if (!toolMap[n]) toolMap[n] = { total: 0, withTool: 0 };
      toolMap[n].total++;
      if ((s.geek_tooleventcount ?? 0) > 0) toolMap[n].withTool++;
    }
    for (const [name, v] of Object.entries(toolMap)) {
      if (v.total >= 5 && v.withTool / v.total < 0.1) {
        items.push({ level: "info", text: `${name} のツール利用率が ${(v.withTool / v.total * 100).toFixed(0)}%（MCP連携の検討推奨）` });
      }
    }

    // 高ターン数会話
    const highTurn = summaries.filter((s) => s.geek_usermsgcount >= 8);
    if (highTurn.length > 0) {
      items.push({ level: "warn", text: `${highTurn.length}件が8ターン超（回答精度・ナレッジ不足の可能性）` });
    }

    return items;
  }, [summaries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">改善提案</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className={`flex items-start gap-2 text-sm p-2 rounded ${s.level === "warn" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
            <span>{s.level === "warn" ? "⚠" : "💡"}</span>
            <span>{s.text}</span>
          </div>
        ))}
        {suggestions.length === 0 && <p className="text-sm text-muted-foreground">現在の指標に問題はありません</p>}
      </CardContent>
    </Card>
  );
}

// ── 最近の会話一覧 ──
function RecentConversations({ summaries, onSelect }: { summaries: ConversationSummary[]; onSelect: (s: ConversationSummary) => void }) {
  const recent = summaries.slice(0, 20);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">最近の会話（直近20件）</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">日時</th>
                <th className="py-2 pr-3">エージェント</th>
                <th className="py-2 pr-3">結果</th>
                <th className="py-2 pr-3 text-right">時間</th>
                <th className="py-2">ユーザー発話</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr
                  key={s.geek_conversationsummaryid}
                  className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onSelect(s)}
                >
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {s.geek_starttime?.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-3 max-w-[150px] truncate" title={s.geek_botname}>{s.geek_botname}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={s.geek_outcome === 100000000 ? "default" : s.geek_outcome === 100000001 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {OUTCOME_LABELS[s.geek_outcome] ?? s.geek_outcome}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{s.geek_durationsec?.toFixed(0)}秒</td>
                  <td className="py-2 max-w-[300px] truncate text-muted-foreground" title={s.geek_firstusertext}>
                    {s.geek_firstusertext?.slice(0, 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── メインダッシュボード ──
export default function CopilotDashboard() {
  const { data: summaries, isLoading } = useConversationSummaries();
  const { data: bots } = useBots();
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const refresh = useRefreshSummaries();

  const handleSync = () => {
    refresh.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(res.message || "同期を開始しました", {
          description: "処理完了まで数分かかる場合があります。自動でデータが更新されます。",
        });
      },
      onError: () => {
        toast.error("同期の開始に失敗しました", {
          description: "Power Automate フロー「サマリー同期」がデプロイ済みか確認してください。",
        });
      },
    });
  };

  // 週次比較（フック規則: 早期 return の前に配置）
  const weekAgo = useMemo(() => {
    if (!summaries || summaries.length === 0) return { convoDelta: 0, rateDelta: 0 };
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 7);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    const thisWeek = summaries.filter((s) => new Date(s.geek_starttime) >= thisWeekStart);
    const lastWeek = summaries.filter((s) => {
      const d = new Date(s.geek_starttime);
      return d >= lastWeekStart && d < thisWeekStart;
    });

    const twCount = thisWeek.length;
    const lwCount = lastWeek.length;
    const twResolved = thisWeek.filter((s) => s.geek_outcome === 100000000).length;
    const lwResolved = lastWeek.filter((s) => s.geek_outcome === 100000000).length;
    const twRate = twCount > 0 ? (twResolved / twCount) * 100 : 0;
    const lwRate = lwCount > 0 ? (lwResolved / lwCount) * 100 : 0;

    return {
      convoDelta: twCount - lwCount,
      rateDelta: twRate - lwRate,
    };
  }, [summaries]);

  if (isLoading || !summaries) return <LoadingSkeletonCard count={4} />;

  const totalConvos = summaries.length;
  const resolved = summaries.filter((s) => s.geek_outcome === 100000000).length;
  const abandoned = summaries.filter((s) => s.geek_outcome === 100000001).length;
  const escalated = summaries.filter((s) => s.geek_outcome === 100000002).length;
  const resolveRate = totalConvos > 0 ? ((resolved / totalConvos) * 100).toFixed(0) : "0";
  const abandonRate = totalConvos > 0 ? ((abandoned / totalConvos) * 100).toFixed(0) : "0";
  const escalateRate = totalConvos > 0 ? ((escalated / totalConvos) * 100).toFixed(0) : "0";
  const avgDur = totalConvos > 0 ? (summaries.reduce((a, s) => a + (s.geek_durationsec ?? 0), 0) / totalConvos).toFixed(1) : "0";
  const avgTurns = totalConvos > 0 ? (summaries.reduce((a, s) => a + (s.geek_usermsgcount ?? 0), 0) / totalConvos).toFixed(1) : "0";
  const toolConvos = summaries.filter((s) => (s.geek_tooleventcount ?? 0) > 0).length;
  const toolRate = totalConvos > 0 ? ((toolConvos / totalConvos) * 100).toFixed(0) : "0";
  const fcrCount = summaries.filter((s) => s.geek_outcome === 100000000 && s.geek_usermsgcount <= 2).length;
  const fcrRate = resolved > 0 ? ((fcrCount / resolved) * 100).toFixed(0) : "0";
  const totalBots = bots?.length ?? 0;
  const activeBots = new Set(summaries.map((s) => s.geek_botid)).size;

  const outcomeCounts: Record<number, number> = {};
  for (const s of summaries) {
    outcomeCounts[s.geek_outcome] = (outcomeCounts[s.geek_outcome] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Copilot Studio AI CoE ダッシュボード</h1>
          <p className="text-muted-foreground">エージェントの利用状況・パフォーマンス・改善ポイントを一元管理</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={refresh.isPending}
        >
          {refresh.isPending
            ? <><Loader2 className="size-4 animate-spin" /> 同期中…</>
            : <><RefreshCw className="size-4" /> データ同期</>
          }
        </Button>
      </div>

      {/* KPI カード — 1段目 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="総会話数" value={totalConvos} delta={{ value: weekAgo.convoDelta, label: "件 vs先週" }} />
        <KpiCard title="解決率" value={`${resolveRate}%`} color={Number(resolveRate) >= 80 ? "hsl(142,76%,36%)" : "hsl(0,84%,60%)"} delta={{ value: Math.round(weekAgo.rateDelta), label: "pt" }} />
        <KpiCard title="放棄率" value={`${abandonRate}%`} color={Number(abandonRate) > 20 ? "hsl(0,84%,60%)" : undefined} sub={`${abandoned}件`} />
        <KpiCard title="エスカレーション率" value={`${escalateRate}%`} color={Number(escalateRate) > 15 ? "hsl(38,92%,50%)" : undefined} sub={`${escalated}件`} />
      </div>

      {/* KPI カード — 2段目 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="平均ターン数" value={avgTurns} sub="ユーザー発話数" />
        <KpiCard title="平均応答時間" value={`${avgDur}秒`} />
        <KpiCard title="ツール利用率" value={`${toolRate}%`} sub={`${toolConvos}件がツール呼出`} />
        <KpiCard title="FCR (初回解決)" value={`${fcrRate}%`} sub={`≤2ターンで解決: ${fcrCount}件`} color={Number(fcrRate) >= 50 ? "hsl(142,76%,36%)" : undefined} />
      </div>

      {/* エージェント概況 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="エージェント" value={`${activeBots} / ${totalBots}`} sub="利用中 / 総数" />
      </div>

      {/* 成果分布 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">セッション成果分布</CardTitle>
        </CardHeader>
        <CardContent>
          <OutcomeBar data={outcomeCounts} />
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            {Object.entries(outcomeCounts).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[Number(k)] }} />
                {OUTCOME_LABELS[Number(k)]}: {v}件
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* メイングリッド */}
      <div className="grid md:grid-cols-2 gap-4">
        <AgentTable summaries={summaries} />
        <div className="space-y-4">
          <DailyTrend summaries={summaries} />
          <ChannelDistribution summaries={summaries} />
        </div>
      </div>

      {/* 時間帯ヒートマップ + ツールランキング */}
      <div className="grid md:grid-cols-2 gap-4">
        <HourlyHeatmap summaries={summaries} />
        <ToolServerRanking summaries={summaries} />
      </div>

      {/* 改善提案 */}
      <ImprovementSuggestions summaries={summaries} />

      {/* 最近の会話 */}
      <RecentConversations summaries={summaries} onSelect={setSelected} />

      {/* 会話チャットビュー */}
      <ConversationChatDialog
        summary={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
