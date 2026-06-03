import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import type { Territory, Opportunity } from "@/types/dataverse";

type Period = "month" | "quarter" | "half" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  month: "月別",
  quarter: "四半期",
  half: "半期",
  year: "年度",
};

interface BudgetAchievementChartProps {
  territories: Territory[];
  opportunities: Opportunity[];
}

/** 会計年度 (4月始まり): 2026年1-3月 → FY2025, 2026年4月以降 → FY2026 */
function getFiscalYear(date: Date): number {
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
}

/** 四半期 (4月始まり): Q1=4-6月, Q2=7-9月, Q3=10-12月, Q4=1-3月 */
function getFiscalQuarter(date: Date): number {
  const m = date.getMonth(); // 0-indexed
  if (m >= 3 && m <= 5) return 1;
  if (m >= 6 && m <= 8) return 2;
  if (m >= 9 && m <= 11) return 3;
  return 4; // 0,1,2 = Jan, Feb, Mar
}

/** 半期 (4月始まり): H1=4-9月, H2=10-3月 */
function getFiscalHalf(date: Date): number {
  const m = date.getMonth();
  return m >= 3 && m <= 8 ? 1 : 2;
}

function getMonthLabel(month: number): string {
  return `${month + 1}月`;
}

export function BudgetAchievementChart({
  territories,
  opportunities,
}: BudgetAchievementChartProps) {
  const [period, setPeriod] = useState<Period>("quarter");

  // 受注商談 (stage === 100000004) だけ
  const wonOpps = useMemo(
    () => opportunities.filter((o) => o.geek_stage === 100000004),
    [opportunities],
  );

  // テリトリー全体の予算合計と年度を取得
  const fiscalYear = useMemo(() => {
    const years = territories.map((t) => t.geek_fiscalyear).filter(Boolean) as number[];
    if (years.length === 0) return new Date().getFullYear();
    // 最頻出年度
    const freq = new Map<number, number>();
    years.forEach((y) => freq.set(y, (freq.get(y) ?? 0) + 1));
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [territories]);

  const totalBudget = useMemo(
    () => territories.reduce((s, t) => s + (t.geek_budget ?? 0), 0),
    [territories],
  );

  // テリトリーに紐づく顧客 ID セット
  const territoryCustIds = useMemo(
    () => new Set(territories.map((t) => t._geek_customerid_value).filter(Boolean) as string[]),
    [territories],
  );

  // 期間ごとの集計データ
  const chartData = useMemo(() => {
    // テリトリー顧客の受注商談のみ対象
    const relevantWon = wonOpps.filter(
      (o) => o._geek_customerid_value && territoryCustIds.has(o._geek_customerid_value),
    );

    switch (period) {
      case "month": {
        // 4月〜翌3月の12ヶ月
        const months = Array.from({ length: 12 }, (_, i) => (i + 3) % 12); // [3,4,5,...,11,0,1,2]
        const monthlyBudget = totalBudget / 12;
        return months.map((m) => {
          const won = relevantWon
            .filter((o) => {
              const d = new Date(o.geek_expectedclosedate ?? o.createdon ?? "");
              return d.getMonth() === m && getFiscalYear(d) === fiscalYear;
            })
            .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
          return {
            name: getMonthLabel(m),
            予算: Math.round(monthlyBudget / 10000),
            受注: Math.round(won / 10000),
          };
        });
      }
      case "quarter": {
        const quarterlyBudget = totalBudget / 4;
        return [1, 2, 3, 4].map((q) => {
          const won = relevantWon
            .filter((o) => {
              const d = new Date(o.geek_expectedclosedate ?? o.createdon ?? "");
              return getFiscalQuarter(d) === q && getFiscalYear(d) === fiscalYear;
            })
            .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
          return {
            name: `Q${q}`,
            予算: Math.round(quarterlyBudget / 10000),
            受注: Math.round(won / 10000),
          };
        });
      }
      case "half": {
        const halfBudget = totalBudget / 2;
        return [1, 2].map((h) => {
          const won = relevantWon
            .filter((o) => {
              const d = new Date(o.geek_expectedclosedate ?? o.createdon ?? "");
              return getFiscalHalf(d) === h && getFiscalYear(d) === fiscalYear;
            })
            .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
          return {
            name: h === 1 ? "上期 (4-9月)" : "下期 (10-3月)",
            予算: Math.round(halfBudget / 10000),
            受注: Math.round(won / 10000),
          };
        });
      }
      case "year": {
        const won = relevantWon
          .filter((o) => {
            const d = new Date(o.geek_expectedclosedate ?? o.createdon ?? "");
            return getFiscalYear(d) === fiscalYear;
          })
          .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
        return [
          {
            name: `FY${fiscalYear}`,
            予算: Math.round(totalBudget / 10000),
            受注: Math.round(won / 10000),
          },
        ];
      }
    }
  }, [period, wonOpps, territories, totalBudget, fiscalYear, territoryCustIds]);

  if (territories.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          予算達成推移（FY{fiscalYear}）
        </CardTitle>
        <div className="flex gap-1">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
            <Button
              key={key}
              variant={period === key ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setPeriod(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}万`}
                width={55}
              />
              <Tooltip
                formatter={(value) => [`¥${value}万`, ""]}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#888" />
              <Bar dataKey="予算" fill="hsl(var(--muted-foreground) / 0.25)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="受注" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          ※ 予算は年間予算を期間で等分。受注は受注完了日（予定日）基準。単位: 万円
        </p>
      </CardContent>
    </Card>
  );
}
