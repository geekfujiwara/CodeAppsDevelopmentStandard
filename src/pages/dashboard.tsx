import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/list-table";
import type { TableColumn } from "@/components/list-table";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Handshake,
  TrendingUp,
  Trophy,
  CalendarClock,
  ArrowRight,
  Building2,
  ClipboardList,
  Percent,
  Timer,
  XCircle,
  Scale,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  useOpportunities,
  useCustomers,
  useActivities,
} from "@/hooks/use-dataverse";
import { StageOptions, IndustryOptions, ActivityTypeOptions, type Opportunity } from "@/types/dataverse";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";

type OpportunityRow = Opportunity & Record<string, unknown>;

// ── カラーパレット ──
const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6",
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: opportunities = [], isLoading: loadingOpp } = useOpportunities();
  const { data: customers = [] } = useCustomers();
  const { data: activities = [] } = useActivities();

  // ── 顧客マップ ──
  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  // ── 営業 KPI 計算 ──
  const totalOpportunities = opportunities.length;
  const pipelineAmount = useMemo(
    () =>
      opportunities
        .filter((o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006)
        .reduce((sum, o) => sum + (o.geek_amount ?? 0), 0),
    [opportunities],
  );
  const wonAmount = useMemo(
    () =>
      opportunities
        .filter((o) => o.geek_stage === 100000004)
        .reduce((sum, o) => sum + (o.geek_amount ?? 0), 0),
    [opportunities],
  );
  const wonCount = opportunities.filter((o) => o.geek_stage === 100000004).length;
  const lostCount = opportunities.filter((o) => o.geek_stage === 100000005).length;
  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

  // 加重パイプライン（金額 × 確率）
  const weightedPipeline = useMemo(
    () =>
      opportunities
        .filter((o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006)
        .reduce((sum, o) => sum + (o.geek_amount ?? 0) * ((o.geek_probability ?? 50) / 100), 0),
    [opportunities],
  );

  // 平均商談サイクル（受注案件の作成日〜受注日）
  const avgDealCycle = useMemo(() => {
    const wonOpps = opportunities.filter(
      (o) => o.geek_stage === 100000004 && o.createdon && o.modifiedon,
    );
    if (wonOpps.length === 0) return 0;
    const totalDays = wonOpps.reduce((sum, o) => {
      const start = new Date(o.createdon!).getTime();
      const end = new Date(o.modifiedon!).getTime();
      return sum + Math.max(1, Math.round((end - start) / 86400000));
    }, 0);
    return Math.round(totalDays / wonOpps.length);
  }, [opportunities]);

  const thisMonthActivities = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return activities.filter((a) => {
      if (!a.geek_activitydate) return false;
      const d = new Date(a.geek_activitydate);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }, [activities]);

  // ── パイプライン（フェーズ別金額） ──
  const pipelineByStage = useMemo(() => {
    const stageMap = new Map<number, number>();
    opportunities.forEach((o) => {
      if (o.geek_stage == null) return;
      stageMap.set(o.geek_stage, (stageMap.get(o.geek_stage) ?? 0) + (o.geek_amount ?? 0));
    });
    return Array.from(stageMap.entries())
      .map(([stage, amount]) => ({
        name: StageOptions[stage] ?? "不明",
        amount,
        stage,
      }))
      .sort((a, b) => a.stage - b.stage);
  }, [opportunities]);

  // ── 月別受注推移（過去6ヶ月） ──
  const monthlyWonTrend = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; amount: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      months.push({ key, label, amount: 0, count: 0 });
    }
    opportunities
      .filter((o) => o.geek_stage === 100000004 && o.modifiedon)
      .forEach((o) => {
        const d = new Date(o.modifiedon!);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const m = months.find((x) => x.key === key);
        if (m) {
          m.amount += o.geek_amount ?? 0;
          m.count += 1;
        }
      });
    return months;
  }, [opportunities]);

  // ── 業種別商談分布 ──
  const industryDistribution = useMemo(() => {
    const m = new Map<number, { count: number; amount: number }>();
    opportunities.forEach((o) => {
      const cid = o._geek_customerid_value;
      if (!cid) return;
      const customer = customers.find((c) => c.geek_customerid === cid);
      const industry = customer?.geek_industry ?? 100000005;
      const cur = m.get(industry) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += o.geek_amount ?? 0;
      m.set(industry, cur);
    });
    return Array.from(m.entries())
      .map(([industry, data]) => ({
        name: IndustryOptions[industry] ?? "その他",
        value: data.count,
        amount: data.amount,
      }))
      .sort((a, b) => b.value - a.value);
  }, [opportunities, customers]);

  // ── 活動種別内訳 ──
  const activityTypeDistribution = useMemo(() => {
    const m = new Map<number, number>();
    activities.forEach((a) => {
      const t = a.geek_type ?? 100000004;
      m.set(t, (m.get(t) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .map(([type, count]) => ({
        name: ActivityTypeOptions[type] ?? "その他",
        value: count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [activities]);

  // ── 顧客別パイプライン TOP5 ──
  const customerPipelineTop5 = useMemo(() => {
    const m = new Map<string, number>();
    opportunities
      .filter((o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006)
      .forEach((o) => {
        const cid = o._geek_customerid_value;
        if (!cid) return;
        m.set(cid, (m.get(cid) ?? 0) + (o.geek_amount ?? 0));
      });
    return Array.from(m.entries())
      .map(([cid, amount]) => ({
        name: customerMap.get(cid) ?? "不明",
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [opportunities, customerMap]);

  // ── 受注予測（フォーキャスト）：今後3ヶ月の月別 ──
  const forecastData = useMemo(() => {
    const now = new Date();
    const months: { label: string; forecast: number; won: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getMonth() + 1}月`;
      let forecast = 0;
      let won = 0;

      opportunities.forEach((o) => {
        if (!o.geek_expectedclosedate) return;
        const closeMonth = o.geek_expectedclosedate.slice(0, 7);
        if (closeMonth !== key) return;

        if (o.geek_stage === 100000004) {
          won += o.geek_amount ?? 0;
        } else if (o.geek_stage !== 100000005 && o.geek_stage !== 100000006) {
          forecast += (o.geek_amount ?? 0) * ((o.geek_probability ?? 50) / 100);
        }
      });
      months.push({ label, forecast, won });
    }
    return months;
  }, [opportunities]);

  // ── 今週のTo-Do（要アクション） ──
  const weeklyTodos = useMemo(() => {
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 86400000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);

    const todos: { type: "close" | "stale"; label: string; detail: string; urgency: "high" | "medium" }[] = [];

    // 1週間以内にクローズ予定の商談
    opportunities
      .filter(
        (o) =>
          o.geek_expectedclosedate &&
          o.geek_stage != null &&
          o.geek_stage >= 100000001 &&
          o.geek_stage <= 100000003,
      )
      .forEach((o) => {
        const closeDate = new Date(o.geek_expectedclosedate!);
        if (closeDate <= oneWeekLater && closeDate >= now) {
          todos.push({
            type: "close",
            label: o.geek_name,
            detail: `${closeDate.toLocaleDateString("ja-JP")} クローズ予定`,
            urgency: closeDate <= new Date(now.getTime() + 3 * 86400000) ? "high" : "medium",
          });
        }
      });

    // 14日以上活動がない顧客（進行中商談あり）
    const activeCustomerIds = new Set(
      opportunities
        .filter((o) => o.geek_stage != null && o.geek_stage >= 100000000 && o.geek_stage <= 100000003)
        .map((o) => o._geek_customerid_value)
        .filter(Boolean),
    );

    const lastActivityByCustomer = new Map<string, string>();
    activities.forEach((a) => {
      const cid = a._geek_customerid_value;
      if (!cid || !a.geek_activitydate) return;
      const cur = lastActivityByCustomer.get(cid);
      if (!cur || a.geek_activitydate > cur) lastActivityByCustomer.set(cid, a.geek_activitydate);
    });

    activeCustomerIds.forEach((cid) => {
      if (!cid) return;
      const lastDate = lastActivityByCustomer.get(cid);
      if (!lastDate || new Date(lastDate) < twoWeeksAgo) {
        const name = customerMap.get(cid);
        if (name) {
          const days = lastDate
            ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000)
            : 999;
          todos.push({
            type: "stale",
            label: name,
            detail: lastDate ? `${days}日間 活動なし` : "活動記録なし",
            urgency: days > 30 ? "high" : "medium",
          });
        }
      }
    });

    return todos.sort((a, b) => (a.urgency === "high" ? -1 : 1) - (b.urgency === "high" ? -1 : 1)).slice(0, 8);
  }, [opportunities, activities, customerMap]);

  // ── クローズ予定の商談（提案〜交渉フェーズのみ） ──
  const upcomingCloses = useMemo(() => {
    return opportunities
      .filter(
        (o) =>
          o.geek_expectedclosedate &&
          o.geek_stage != null &&
          o.geek_stage >= 100000001 &&
          o.geek_stage <= 100000003,
      )
      .sort(
        (a, b) =>
          new Date(a.geek_expectedclosedate!).getTime() -
          new Date(b.geek_expectedclosedate!).getTime(),
      )
      .slice(0, 5);
  }, [opportunities]);

  // ── 統計カード (8つ) ──
  const stats = [
    {
      title: "商談件数",
      value: String(totalOpportunities),
      description: "全商談",
      icon: Handshake,
      className: "text-blue-600",
    },
    {
      title: "パイプライン",
      value: `¥${(pipelineAmount / 10000).toFixed(0)}万`,
      description: "進行中合計",
      icon: TrendingUp,
      className: "text-purple-600",
    },
    {
      title: "加重パイプライン",
      value: `¥${(weightedPipeline / 10000).toFixed(0)}万`,
      description: "金額×確率",
      icon: Scale,
      className: "text-indigo-600",
    },
    {
      title: "受注",
      value: `¥${(wonAmount / 10000).toFixed(0)}万`,
      description: `${wonCount}件 受注`,
      icon: Trophy,
      className: "text-green-600",
    },
    {
      title: "受注率",
      value: `${winRate}%`,
      description: `${closedCount}件中 ${wonCount}件`,
      icon: Percent,
      className: "text-emerald-600",
    },
    {
      title: "平均サイクル",
      value: `${avgDealCycle}日`,
      description: "受注までの平均",
      icon: Timer,
      className: "text-amber-600",
    },
    {
      title: "失注",
      value: String(lostCount),
      description: "件の失注",
      icon: XCircle,
      className: "text-red-500",
    },
    {
      title: "今月の活動",
      value: String(thisMonthActivities),
      description: "件の活動記録",
      icon: ClipboardList,
      className: "text-cyan-600",
    },
  ];

  // ── テーブル列定義 ──
  const closeColumns: TableColumn<OpportunityRow>[] = [
    { key: "geek_name", label: "商談名", sortable: false },
    {
      key: "_geek_customerid_value",
      label: "顧客",
      sortable: false,
      render: (item) => {
        const v = item._geek_customerid_value;
        return v ? customerMap.get(v) ?? "" : "";
      },
    },
    {
      key: "geek_amount",
      label: "金額",
      align: "right" as const,
      sortable: false,
      render: (item) =>
        item.geek_amount != null ? `¥${item.geek_amount.toLocaleString()}` : "",
    },
    {
      key: "geek_expectedclosedate",
      label: "予定日",
      sortable: false,
      render: (item) =>
        item.geek_expectedclosedate
          ? new Date(item.geek_expectedclosedate).toLocaleDateString("ja-JP")
          : "",
    },
    {
      key: "geek_stage",
      label: "フェーズ",
      sortable: false,
      render: (item) => {
        const s = item.geek_stage;
        return s != null ? (
          <Badge variant="secondary">{StageOptions[s] ?? ""}</Badge>
        ) : null;
      },
    },
  ];

  if (loadingOpp) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <LoadingSkeletonGrid columns={4} count={8} variant="compact" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LoadingSkeletonGrid columns={1} count={1} variant="detailed" />
          <LoadingSkeletonGrid columns={1} count={1} variant="detailed" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* KPI カード (8枚 → 4×2 グリッド) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.className}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </CardContent>
            {/* デコレーション */}
            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent ${s.className.replace("text-", "via-")}/30 to-transparent`} />
          </Card>
        ))}
      </div>

      {/* 月別受注推移 + パイプライン(フェーズ別) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 月別受注推移 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              月別受注推移（6ヶ月）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyWonTrend.every((m) => m.amount === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlyWonTrend} margin={{ left: 8, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="wonGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === "amount" ? `¥${Number(value).toLocaleString()}` : `${value}件`,
                      name === "amount" ? "受注金額" : "件数",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#wonGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* パイプラインチャート */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">パイプライン（フェーズ別金額）</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineByStage.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={pipelineByStage} margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString()}`, "金額"]} />
                  <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 受注予測（フォーキャスト） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-indigo-500" />
            受注予測（今後3ヶ月）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forecastData.every((m) => m.forecast === 0 && m.won === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={forecastData} margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(value, name) => [`¥${Number(value).toLocaleString()}`, name === "won" ? "受注確定" : "予測（加重）"]} />
                <Bar dataKey="won" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={32} name="won" stackId="a" />
                <Bar dataKey="forecast" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={32} name="forecast" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center justify-center gap-4 mt-2 text-xs">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /><span>受注確定</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-indigo-400" /><span>予測（金額×確率）</span></div>
          </div>
        </CardContent>
      </Card>

      {/* 業種別 + 活動種別 (ドーナツチャート) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 業種別商談分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-orange-500" />
              業種別商談
            </CardTitle>
          </CardHeader>
          <CardContent>
            {industryDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={industryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {industryDistribution.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, props) => [`${value}件`, props.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {industryDistribution.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span>{d.name}</span>
                      <span className="text-muted-foreground">({d.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 活動種別内訳 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-cyan-500" />
              活動種別
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityTypeDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={activityTypeDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {activityTypeDistribution.map((_, i) => (
                        <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, props) => [`${value}件`, props.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {activityTypeDistribution.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[(i + 3) % COLORS.length] }} />
                      <span>{d.name}</span>
                      <span className="text-muted-foreground">({d.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 顧客別パイプライン TOP5 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              顧客別 TOP5
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customerPipelineTop5.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={customerPipelineTop5} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(value) => [`¥${Number(value).toLocaleString()}`, "パイプライン"]} />
                  <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 今週のTo-Do + クローズ予定 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 今週のTo-Do */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              今週の要アクション
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyTodos.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm">すべて対応済みです</p>
              </div>
            ) : (
              <div className="space-y-2">
                {weeklyTodos.map((todo, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-2.5 rounded-md border ${
                      todo.urgency === "high" ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20" : "border-border"
                    }`}
                  >
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                      todo.urgency === "high" ? "bg-red-500" : "bg-amber-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{todo.label}</p>
                      <p className="text-xs text-muted-foreground">{todo.detail}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {todo.type === "close" ? "クローズ予定" : "要フォロー"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* クローズ予定の商談 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">クローズ予定の商談</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/opportunities")}
            >
              すべて表示 <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingCloses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                予定なし
              </p>
            ) : (
              <ListTable
                data={upcomingCloses as OpportunityRow[]}
                columns={closeColumns}
                searchKeys={["geek_name"]}
                onRowClick={() => navigate("/opportunities")}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
