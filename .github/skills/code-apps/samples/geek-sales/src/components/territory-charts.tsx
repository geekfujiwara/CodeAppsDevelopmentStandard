import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Treemap,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  PieChart as PieIcon,
  Activity,
  BarChart3,
  Layers,
  Zap,
} from "lucide-react";
import type { Territory, Opportunity, Customer } from "@/types/dataverse";
import { IndustryOptions, StageOptions } from "@/types/dataverse";

// ── 共通カラーパレット ──
const COLORS = [
  "hsl(217, 91%, 60%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(262, 83%, 58%)",  // purple
  "hsl(25, 95%, 53%)",   // orange
  "hsl(340, 82%, 52%)",  // pink
  "hsl(47, 96%, 53%)",   // yellow
  "hsl(173, 80%, 40%)",  // teal
  "hsl(0, 84%, 60%)",    // red
];

const STAGE_COLORS: Record<number, string> = {
  100000000: "hsl(210, 40%, 70%)",  // リード - light blue
  100000001: "hsl(217, 91%, 60%)",  // 提案 - blue
  100000002: "hsl(262, 83%, 58%)",  // 見積 - purple
  100000003: "hsl(25, 95%, 53%)",   // 交渉 - orange
  100000004: "hsl(142, 71%, 45%)",  // 受注 - green
  100000005: "hsl(0, 84%, 60%)",    // 失注 - red
  100000006: "hsl(0, 0%, 60%)",     // キャンセル - gray
};

interface ChartsProps {
  territories: Territory[];
  opportunities: Opportunity[];
  customers: Customer[];
}

// ── 1. 月次累積受注トレンド（エリアチャート）──
export function CumulativeWinTrendChart({ territories, opportunities }: Omit<ChartsProps, "customers">) {
  const territoryCustIds = useMemo(
    () => new Set(territories.map((t) => t._geek_customerid_value).filter(Boolean) as string[]),
    [territories],
  );

  const chartData = useMemo(() => {
    const wonOpps = opportunities.filter(
      (o) => o.geek_stage === 100000004 && o._geek_customerid_value && territoryCustIds.has(o._geek_customerid_value),
    );

    // 直近12ヶ月を生成
    const months: { label: string; year: number; month: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: `${d.getMonth() + 1}月`, year: d.getFullYear(), month: d.getMonth() });
    }

    let cumulative = 0;
    const totalBudget = territories.reduce((s, t) => s + (t.geek_budget ?? 0), 0);
    const monthlyTarget = totalBudget / 12;
    let cumulativeTarget = 0;

    return months.map((m) => {
      const monthWon = wonOpps
        .filter((o) => {
          const d = new Date(o.geek_expectedclosedate ?? o.createdon ?? "");
          return d.getFullYear() === m.year && d.getMonth() === m.month;
        })
        .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
      cumulative += monthWon;
      cumulativeTarget += monthlyTarget;
      return {
        name: m.label,
        累積受注: Math.round(cumulative / 10000),
        目標ライン: Math.round(cumulativeTarget / 10000),
        月次受注: Math.round(monthWon / 10000),
      };
    });
  }, [opportunities, territories, territoryCustIds]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          累積受注トレンド（12ヶ月）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="wonGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}万`} width={50} />
              <Tooltip formatter={(value) => [`¥${value}万`, ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="累積受注"
                stroke="hsl(142, 71%, 45%)"
                fill="url(#wonGradient)"
                strokeWidth={2.5}
              />
              <Area
                type="monotone"
                dataKey="目標ライン"
                stroke="hsl(0, 0%, 60%)"
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="5 5"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 2. 商談ステージ分布（ドーナツチャート）──
export function StageDistributionChart({ territories, opportunities }: Omit<ChartsProps, "customers">) {
  const territoryCustIds = useMemo(
    () => new Set(territories.map((t) => t._geek_customerid_value).filter(Boolean) as string[]),
    [territories],
  );

  const chartData = useMemo(() => {
    const relevant = opportunities.filter(
      (o) => o._geek_customerid_value && territoryCustIds.has(o._geek_customerid_value),
    );

    const stageCount = new Map<number, { count: number; amount: number }>();
    relevant.forEach((o) => {
      const stage = o.geek_stage ?? 100000000;
      const cur = stageCount.get(stage) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += o.geek_amount ?? 0;
      stageCount.set(stage, cur);
    });

    return Array.from(stageCount.entries())
      .filter(([stage]) => stage !== 100000005 && stage !== 100000006) // 失注・キャンセル除外
      .map(([stage, data]) => ({
        name: StageOptions[stage] ?? "不明",
        value: data.count,
        amount: data.amount,
        fill: STAGE_COLORS[stage] ?? COLORS[0],
      }));
  }, [opportunities, territoryCustIds]);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-violet-600" />
          商談ステージ分布
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={{ strokeWidth: 1 }}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name, entry) => [
                  `${value}件 (¥${Math.round((entry?.payload?.amount ?? 0) / 10000)}万)`,
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          アクティブ商談 {total}件（失注・キャンセル除く）
        </p>
      </CardContent>
    </Card>
  );
}

// ── 3. 顧客別パイプライン比較（横棒グラフ）──
export function CustomerPipelineChart({ territories, opportunities, customers }: ChartsProps) {
  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  const chartData = useMemo(() => {
    return territories
      .map((t) => {
        const cid = t._geek_customerid_value ?? "";
        const name = customerMap.get(cid) ?? t.geek_name;
        // 短縮名（最大6文字）
        const shortName = name.length > 6 ? name.slice(0, 6) + "…" : name;
        const won = opportunities
          .filter((o) => o._geek_customerid_value === cid && o.geek_stage === 100000004)
          .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
        const pipeline = opportunities
          .filter(
            (o) =>
              o._geek_customerid_value === cid &&
              o.geek_stage !== 100000004 &&
              o.geek_stage !== 100000005 &&
              o.geek_stage !== 100000006,
          )
          .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
        const budget = t.geek_budget ?? 0;
        return { name: shortName, 受注: Math.round(won / 10000), パイプライン: Math.round(pipeline / 10000), 予算: Math.round(budget / 10000) };
      })
      .sort((a, b) => (b.受注 + b.パイプライン) - (a.受注 + a.パイプライン));
  }, [territories, opportunities, customerMap]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-600" />
          顧客別 受注 vs パイプライン
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}万`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(value) => [`¥${value}万`, ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="受注" stackId="a" fill="hsl(142, 71%, 45%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="パイプライン" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 4. 業種別レーダーチャート ──
export function IndustryRadarChart({ territories, opportunities, customers }: ChartsProps) {
  const chartData = useMemo(() => {
    // 顧客→業種マップ
    const custIndustry = new Map<string, number>();
    customers.forEach((c) => {
      if (c.geek_industry != null) custIndustry.set(c.geek_customerid, c.geek_industry);
    });

    // 業種別集計
    const industryStats = new Map<number, { budget: number; won: number; pipeline: number; count: number }>();

    territories.forEach((t) => {
      const cid = t._geek_customerid_value ?? "";
      const ind = custIndustry.get(cid);
      if (ind == null) return;
      const cur = industryStats.get(ind) ?? { budget: 0, won: 0, pipeline: 0, count: 0 };
      cur.budget += t.geek_budget ?? 0;
      cur.count += 1;

      const won = opportunities
        .filter((o) => o._geek_customerid_value === cid && o.geek_stage === 100000004)
        .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
      const pipeline = opportunities
        .filter(
          (o) =>
            o._geek_customerid_value === cid &&
            o.geek_stage !== 100000004 &&
            o.geek_stage !== 100000005 &&
            o.geek_stage !== 100000006,
        )
        .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
      cur.won += won;
      cur.pipeline += pipeline;
      industryStats.set(ind, cur);
    });

    return Array.from(industryStats.entries()).map(([ind, stats]) => ({
      industry: IndustryOptions[ind] ?? "その他",
      予算: Math.round(stats.budget / 10000),
      受注: Math.round(stats.won / 10000),
      パイプライン: Math.round(stats.pipeline / 10000),
    }));
  }, [territories, opportunities, customers]);

  if (chartData.length < 3) return null; // レーダーは3軸以上必要

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-600" />
          業種別パフォーマンス
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid strokeDasharray="3 3" className="opacity-30" />
              <PolarAngleAxis dataKey="industry" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}万`} />
              <Radar name="予算" dataKey="予算" stroke="hsl(0, 0%, 50%)" fill="hsl(0, 0%, 50%)" fillOpacity={0.1} strokeWidth={1.5} />
              <Radar name="受注" dataKey="受注" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.2} strokeWidth={2} />
              <Radar name="パイプライン" dataKey="パイプライン" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.15} strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`¥${value}万`, ""]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 5. 受注確度ヒートマップ（Treemap）──
export function WinRateTreemap({ territories, opportunities, customers }: ChartsProps) {
  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  const chartData = useMemo(() => {
    return territories
      .map((t) => {
        const cid = t._geek_customerid_value ?? "";
        const name = customerMap.get(cid) ?? t.geek_name;
        const budget = t.geek_budget ?? 0;
        const won = opportunities
          .filter((o) => o._geek_customerid_value === cid && o.geek_stage === 100000004)
          .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
        const rate = budget > 0 ? Math.round((won / budget) * 100) : 0;
        return { name: name.length > 5 ? name.slice(0, 5) + "…" : name, size: Math.max(budget, 1), rate, fullName: name };
      })
      .sort((a, b) => b.size - a.size);
  }, [territories, opportunities, customerMap]);

  // 色を達成率で変える
  const getColor = (rate: number) => {
    if (rate >= 100) return "hsl(142, 71%, 40%)";
    if (rate >= 70) return "hsl(142, 50%, 55%)";
    if (rate >= 40) return "hsl(47, 96%, 53%)";
    if (rate >= 20) return "hsl(25, 95%, 53%)";
    return "hsl(0, 84%, 55%)";
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomContent = (props: any) => {
    const { x, y, width, height, name, rate } = props;
    if (width < 40 || height < 30) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={getColor(rate)} rx={4} stroke="hsl(var(--background))" strokeWidth={2} />
        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600}>
          {name}
        </text>
        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={10}>
          {rate}%
        </text>
      </g>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4 text-rose-600" />
          顧客別 達成率マップ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={chartData}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="none"
              content={<CustomContent />}
            >
              <Tooltip
                formatter={(_, __, entry) => {
                  const p = entry?.payload;
                  return [`達成率 ${p?.rate ?? 0}% / 予算 ¥${Math.round((p?.size ?? 0) / 10000)}万`, p?.fullName ?? ""];
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-3 mt-2">
          {[
            { label: "100%+", color: "hsl(142, 71%, 40%)" },
            { label: "70-99%", color: "hsl(142, 50%, 55%)" },
            { label: "40-69%", color: "hsl(47, 96%, 53%)" },
            { label: "20-39%", color: "hsl(25, 95%, 53%)" },
            { label: "<20%", color: "hsl(0, 84%, 55%)" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── 6. パイプラインファネル（水平ステップバー）──
export function PipelineFunnelChart({ territories, opportunities }: Omit<ChartsProps, "customers">) {
  const territoryCustIds = useMemo(
    () => new Set(territories.map((t) => t._geek_customerid_value).filter(Boolean) as string[]),
    [territories],
  );

  const chartData = useMemo(() => {
    const relevant = opportunities.filter(
      (o) =>
        o._geek_customerid_value &&
        territoryCustIds.has(o._geek_customerid_value) &&
        o.geek_stage !== 100000005 &&
        o.geek_stage !== 100000006,
    );

    const stages = [100000000, 100000001, 100000002, 100000003, 100000004];
    return stages.map((stage) => {
      const stageOpps = relevant.filter((o) => o.geek_stage === stage);
      const amount = stageOpps.reduce((s, o) => s + (o.geek_amount ?? 0), 0);
      return {
        name: StageOptions[stage] ?? "不明",
        件数: stageOpps.length,
        金額: Math.round(amount / 10000),
        fill: STAGE_COLORS[stage],
      };
    });
  }, [opportunities, territoryCustIds]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-600" />
          パイプラインファネル
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}万`} width={50} />
              <Tooltip
                formatter={(value, name) => [
                  name === "金額" ? `¥${value}万` : `${value}件`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="金額" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 7. 月次商談獲得ペース ──
export function MonthlyDealPaceChart({ territories, opportunities }: Omit<ChartsProps, "customers">) {
  const territoryCustIds = useMemo(
    () => new Set(territories.map((t) => t._geek_customerid_value).filter(Boolean) as string[]),
    [territories],
  );

  const chartData = useMemo(() => {
    const relevant = opportunities.filter(
      (o) => o._geek_customerid_value && territoryCustIds.has(o._geek_customerid_value),
    );

    const months: { label: string; year: number; month: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: `${d.getMonth() + 1}月`, year: d.getFullYear(), month: d.getMonth() });
    }

    return months.map((m) => {
      const created = relevant.filter((o) => {
        const d = new Date(o.createdon ?? "");
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      });
      const won = created.filter((o) => o.geek_stage === 100000004);
      const lost = created.filter((o) => o.geek_stage === 100000005 || o.geek_stage === 100000006);
      return {
        name: m.label,
        新規: created.length,
        受注: won.length,
        失注: lost.length,
      };
    });
  }, [opportunities, territoryCustIds]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-600" />
          月次商談ペース（6ヶ月）
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={30} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="新規" fill="hsl(217, 91%, 60%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="受注" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="失注" fill="hsl(0, 84%, 60%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
