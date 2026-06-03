import { useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  Plus,
  TrendingUp,
  Building2,
  Wallet,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Layers,
  BarChart3,
  Percent,
  DollarSign,
} from "lucide-react";
import { ListTable } from "@/components/list-table";
import type { TableColumn } from "@/components/list-table";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BudgetAchievementChart } from "@/components/budget-achievement-chart";
import { TerritoryNews } from "@/components/territory-news";
import {
  CumulativeWinTrendChart,
  StageDistributionChart,
  CustomerPipelineChart,
  IndustryRadarChart,
  WinRateTreemap,
  PipelineFunnelChart,
  MonthlyDealPaceChart,
} from "@/components/territory-charts";
import {
  useTerritories,
  useCreateTerritory,
  useUpdateTerritory,
  useDeleteTerritory,
  useCustomers,
  useOpportunities,
} from "@/hooks/use-dataverse";
import type { Territory, TerritoryCreate, Customer } from "@/types/dataverse";
import { IndustryOptions } from "@/types/dataverse";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";

type TerritoryRow = Territory & Record<string, unknown>;

export default function TerritoryPage() {
  const { data: territories = [], isLoading, refetch: refetchTerritories } = useTerritories();
  const { data: customers = [], refetch: refetchCustomers } = useCustomers();
  const { data: opportunities = [], refetch: refetchOpportunities } = useOpportunities();
  const createMut = useCreateTerritory();
  const updateMut = useUpdateTerritory();
  const deleteMut = useDeleteTerritory();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Territory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Territory | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const submitRef = useRef<(() => void) | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchTerritories(), refetchCustomers(), refetchOpportunities()]);
    setIsRefreshing(false);
  };

  // 全テリトリーを表示
  const myTerritories = territories;

  // 顧客名マップ
  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  // 顧客ごとの受注額
  const wonByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    opportunities
      .filter((o) => o.geek_stage === 100000004)
      .forEach((o) => {
        const cid = o._geek_customerid_value;
        if (cid) m.set(cid, (m.get(cid) ?? 0) + (o.geek_amount ?? 0));
      });
    return m;
  }, [opportunities]);

  // 顧客ごとのパイプライン
  const pipelineByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    opportunities
      .filter((o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006)
      .forEach((o) => {
        const cid = o._geek_customerid_value;
        if (cid) m.set(cid, (m.get(cid) ?? 0) + (o.geek_amount ?? 0));
      });
    return m;
  }, [opportunities]);

  // 顧客ごとの商談数
  const oppCountByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    opportunities.forEach((o) => {
      const cid = o._geek_customerid_value;
      if (cid) m.set(cid, (m.get(cid) ?? 0) + 1);
    });
    return m;
  }, [opportunities]);

  // KPI
  const totalBudget = myTerritories.reduce((s, t) => s + (t.geek_budget ?? 0), 0);
  const totalWon = myTerritories.reduce(
    (s, t) => s + (wonByCustomer.get(t._geek_customerid_value ?? "") ?? 0),
    0,
  );
  const achievementRate = totalBudget > 0 ? Math.round((totalWon / totalBudget) * 100) : 0;

  // 追加KPI
  const totalPipeline = myTerritories.reduce(
    (s, t) => s + (pipelineByCustomer.get(t._geek_customerid_value ?? "") ?? 0),
    0,
  );
  const totalOppCount = myTerritories.reduce(
    (s, t) => s + (oppCountByCustomer.get(t._geek_customerid_value ?? "") ?? 0),
    0,
  );
  const avgDealSize = totalOppCount > 0 ? Math.round((totalWon + totalPipeline) / totalOppCount) : 0;
  const gapToTarget = Math.max(0, totalBudget - totalWon);
  const pipelineCoverage = gapToTarget > 0 ? Math.round((totalPipeline / gapToTarget) * 100) : (totalWon >= totalBudget ? 999 : 0);
  const winRate = useMemo(() => {
    const territoryCustIds = new Set(myTerritories.map((t) => t._geek_customerid_value).filter(Boolean));
    const closedOpps = opportunities.filter(
      (o) => o._geek_customerid_value && territoryCustIds.has(o._geek_customerid_value) &&
        (o.geek_stage === 100000004 || o.geek_stage === 100000005),
    );
    const wonCount = closedOpps.filter((o) => o.geek_stage === 100000004).length;
    return closedOpps.length > 0 ? Math.round((wonCount / closedOpps.length) * 100) : 0;
  }, [myTerritories, opportunities]);

  // AI要約生成
  const aiSummary = useMemo(() => {
    if (!showSummary || myTerritories.length === 0) return null;

    // 顧客別の分析データ
    const customerAnalysis = myTerritories.map((t) => {
      const cid = t._geek_customerid_value ?? "";
      const custName = customerMap.get(cid) ?? t.geek_name;
      const won = wonByCustomer.get(cid) ?? 0;
      const pipeline = pipelineByCustomer.get(cid) ?? 0;
      const budget = t.geek_budget ?? 0;
      const rate = budget > 0 ? Math.round((won / budget) * 100) : 0;
      const oppCount = oppCountByCustomer.get(cid) ?? 0;
      const customer = customers.find((c) => c.geek_customerid === cid);
      return { cid, custName, won, pipeline, budget, rate, oppCount, customer };
    });

    // リスク顧客: 達成率30%未満 & パイプラインも予算の50%未満
    const riskCustomers = customerAnalysis.filter(
      (c) => c.rate < 30 && c.budget > 0 && (c.pipeline + c.won) < c.budget * 0.5,
    );

    // 優先顧客: パイプラインが大きく達成率がまだ低い（伸びしろ）
    const priorityCustomers = customerAnalysis
      .filter((c) => c.pipeline > 0 && c.rate < 80)
      .sort((a, b) => b.pipeline - a.pipeline)
      .slice(0, 3);

    // 好調顧客: 達成率80%以上
    const highPerformers = customerAnalysis.filter((c) => c.rate >= 80 && c.budget > 0);

    // 全体サマリ
    const totalPipeline = customerAnalysis.reduce((s, c) => s + c.pipeline, 0);
    const gapToTarget = Math.max(0, totalBudget - totalWon);
    const pipelineCoverage = gapToTarget > 0 ? Math.round((totalPipeline / gapToTarget) * 100) : 999;

    // 業種別偏り
    const industryBreakdown = new Map<number, number>();
    customerAnalysis.forEach((c) => {
      if (c.customer?.geek_industry != null) {
        const ind = c.customer.geek_industry;
        industryBreakdown.set(ind, (industryBreakdown.get(ind) ?? 0) + (c.budget ?? 0));
      }
    });

    return {
      customerAnalysis,
      riskCustomers,
      priorityCustomers,
      highPerformers,
      totalPipeline,
      gapToTarget,
      pipelineCoverage,
      industryBreakdown,
    };
  }, [showSummary, myTerritories, customerMap, wonByCustomer, pipelineByCustomer, oppCountByCustomer, customers, totalBudget, totalWon]);

  const columns: TableColumn<TerritoryRow>[] = useMemo(
    () => [
      {
        key: "geek_name",
        label: "顧客",
        sortable: true,
        render: (item) =>
          customerMap.get(item._geek_customerid_value ?? "") ?? item.geek_name,
      },
      {
        key: "geek_budget",
        label: "予算",
        align: "right" as const,
        render: (item) =>
          item.geek_budget != null
            ? `¥${item.geek_budget.toLocaleString()}`
            : "-",
      },
      {
        key: "_won" as keyof TerritoryRow,
        label: "受注額",
        align: "right" as const,
        render: (item) => {
          const won = wonByCustomer.get(item._geek_customerid_value ?? "") ?? 0;
          return `¥${won.toLocaleString()}`;
        },
      },
      {
        key: "_achievement" as keyof TerritoryRow,
        label: "達成率",
        render: (item) => {
          const won = wonByCustomer.get(item._geek_customerid_value ?? "") ?? 0;
          const budget = item.geek_budget ?? 0;
          const rate = budget > 0 ? Math.round((won / budget) * 100) : 0;
          return (
            <div className="flex items-center gap-2 min-w-[120px]">
              <Progress value={Math.min(rate, 100)} className="h-2 flex-1" />
              <span className="text-xs font-medium w-10 text-right">{rate}%</span>
            </div>
          );
        },
      },
      {
        key: "_pipeline" as keyof TerritoryRow,
        label: "パイプライン",
        align: "right" as const,
        render: (item) => {
          const pipeline = pipelineByCustomer.get(item._geek_customerid_value ?? "") ?? 0;
          return `¥${pipeline.toLocaleString()}`;
        },
      },
      {
        key: "_opp_count" as keyof TerritoryRow,
        label: "商談数",
        align: "right" as const,
        render: (item) =>
          `${oppCountByCustomer.get(item._geek_customerid_value ?? "") ?? 0}件`,
      },
      {
        key: "geek_fiscalyear",
        label: "年度",
        render: (item) => (item.geek_fiscalyear ? `${item.geek_fiscalyear}` : "-"),
      },
    ],
    [customerMap, wonByCustomer, pipelineByCustomer, oppCountByCustomer],
  );

  const handleSave = (data: Partial<TerritoryCreate>) => {
    if (editItem) {
      updateMut.mutate(
        { id: editItem.geek_territoryid, data },
        { onSuccess: () => { setIsFormOpen(false); setEditItem(null); } },
      );
    } else {
      createMut.mutate(data as TerritoryCreate, {
        onSuccess: () => { setIsFormOpen(false); },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <LoadingSkeletonGrid columns={1} count={3} variant="detailed" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            テリトリー
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            担当顧客の予算と達成状況
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="データを更新"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant={showSummary ? "default" : "outline"}
            onClick={() => setShowSummary(!showSummary)}
          >
            <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
            AI要約
          </Button>
          <Button
            onClick={() => {
              setEditItem(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            追加
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              担当顧客
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{myTerritories.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-purple-600" />
              予算合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{(totalBudget / 10000).toFixed(0)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              受注合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{(totalWon / 10000).toFixed(0)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-600" />
              達成率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">{achievementRate}%</p>
              <Progress value={Math.min(achievementRate, 100)} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI 2段目 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-600" />
              パイプライン
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{(totalPipeline / 10000).toFixed(0)}万</p>
            <p className="text-xs text-muted-foreground mt-1">カバー率 {pipelineCoverage > 900 ? "∞" : `${pipelineCoverage}%`}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              商談数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalOppCount}件</p>
            <p className="text-xs text-muted-foreground mt-1">残額 ¥{(gapToTarget / 10000).toFixed(0)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              平均案件額
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{(avgDealSize / 10000).toFixed(0)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Percent className="h-4 w-4 text-rose-600" />
              勝率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">{winRate}%</p>
              <Progress value={winRate} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* チャートセクション 1段目: 累積トレンド + ファネル + ステージ分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="min-h-[280px]">
          <CumulativeWinTrendChart territories={myTerritories} opportunities={opportunities} />
        </div>
        <div className="min-h-[280px]">
          <PipelineFunnelChart territories={myTerritories} opportunities={opportunities} />
        </div>
        <div className="min-h-[280px]">
          <StageDistributionChart territories={myTerritories} opportunities={opportunities} />
        </div>
      </div>

      {/* チャートセクション 2段目: 顧客別パイプライン + 業種レーダー + 達成率マップ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="min-h-[280px]">
          <CustomerPipelineChart territories={myTerritories} opportunities={opportunities} customers={customers} />
        </div>
        <div className="min-h-[280px]">
          <IndustryRadarChart territories={myTerritories} opportunities={opportunities} customers={customers} />
        </div>
        <div className="min-h-[280px]">
          <WinRateTreemap territories={myTerritories} opportunities={opportunities} customers={customers} />
        </div>
      </div>

      {/* チャートセクション 3段目: 予算達成推移 + 月次ペース */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-h-[300px]">
          <BudgetAchievementChart territories={myTerritories} opportunities={opportunities} />
        </div>
        <div className="min-h-[280px]">
          <MonthlyDealPaceChart territories={myTerritories} opportunities={opportunities} />
        </div>
      </div>

      {/* メインコンテンツ: テーブル + ニュース */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左カラム: テーブル + AI要約 */}
        <div className={showSummary ? "lg:col-span-3 space-y-6" : "lg:col-span-3 space-y-6"}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">顧客別テリトリー予算</CardTitle>
              <Badge variant="secondary">{myTerritories.length}件</Badge>
            </CardHeader>
            <CardContent>
              {myTerritories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  テリトリーが未設定です。「追加」ボタンから担当顧客を登録してください。
                </p>
              ) : (
                <ListTable
                  data={myTerritories as TerritoryRow[]}
                  columns={columns}
                  searchKeys={["geek_name"]}
                  onRowClick={(row) => {
                    setEditItem(row);
                    setIsFormOpen(true);
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* AI要約パネル（テーブル下に表示） */}
          {showSummary && aiSummary && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    テリトリー分析
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSummary(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 全体概況 */}
                <div className="rounded-md bg-muted/50 p-3 space-y-2">
                  <p className="text-sm font-semibold">📊 全体概況</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    担当 {myTerritories.length} 顧客の予算合計 ¥{(totalBudget / 10000).toFixed(0)}万 に対し、
                    現在の受注額は ¥{(totalWon / 10000).toFixed(0)}万（達成率 {achievementRate}%）。
                    {aiSummary.gapToTarget > 0 && (
                      <>
                        目標達成まで残り ¥{(aiSummary.gapToTarget / 10000).toFixed(0)}万。
                        パイプラインカバー率は {aiSummary.pipelineCoverage}%
                        {aiSummary.pipelineCoverage < 150
                          ? "（不足 — 新規案件の創出が必要）"
                          : aiSummary.pipelineCoverage < 300
                            ? "（やや不足 — 受注確度の向上に注力）"
                            : "（十分 — 確実なクロージングに集中）"}
                        。
                      </>
                    )}
                  </p>
                </div>

                {/* 優先アクション + リスク + 好調 を横並び */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* 優先アクション */}
                  {aiSummary.priorityCustomers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        優先アクション
                      </p>
                      <div className="space-y-2">
                        {aiSummary.priorityCustomers.map((c) => (
                          <div key={c.cid} className="rounded-md border p-2.5 text-xs space-y-1">
                            <p className="font-semibold">{c.custName}</p>
                            <p className="text-muted-foreground">
                              パイプライン ¥{(c.pipeline / 10000).toFixed(0)}万 / 達成率 {c.rate}%
                            </p>
                            <p className="text-primary">
                              → {c.rate < 30
                                ? "早期のクロージング促進と商談加速が必要"
                                : c.rate < 60
                                  ? "提案内容の精査と意思決定者への接触を推奨"
                                  : "最終交渉に集中し受注確度を高める"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* リスク警告 */}
                  {aiSummary.riskCustomers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        リスク顧客
                      </p>
                      <div className="space-y-2">
                        {aiSummary.riskCustomers.map((c) => (
                          <div key={c.cid} className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10 p-2.5 text-xs space-y-1">
                            <p className="font-semibold text-red-700 dark:text-red-400">{c.custName}</p>
                            <p className="text-muted-foreground">
                              予算 ¥{(c.budget / 10000).toFixed(0)}万 に対し受注+パイプ ¥{((c.won + c.pipeline) / 10000).toFixed(0)}万
                            </p>
                            <p className="text-red-600 dark:text-red-400">
                              → {c.oppCount === 0
                                ? "商談がゼロ — 即座に新規案件の掘り起こしが必要"
                                : c.pipeline === 0
                                  ? "パイプラインが枯渇 — 追加提案や別部門へのアプローチを検討"
                                  : "進捗が遅延 — 阻害要因を特定しネクストアクションを見直す"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 好調 + 業種ポートフォリオ */}
                  <div className="space-y-4">
                    {aiSummary.highPerformers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          好調
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {aiSummary.highPerformers.map((c) => (
                            <Badge key={c.cid} variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              {c.custName} ({c.rate}%)
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          → アップセル・クロスセルの機会を探り、追加受注を狙う
                        </p>
                      </div>
                    )}

                    {/* 業種別集中度 */}
                    {aiSummary.industryBreakdown.size > 1 && (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">🏢 業種ポートフォリオ</p>
                        <div className="space-y-1.5">
                          {Array.from(aiSummary.industryBreakdown.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([ind, budget]) => {
                              const pct = totalBudget > 0 ? Math.round((budget / totalBudget) * 100) : 0;
                              return (
                                <div key={ind} className="flex items-center gap-2 text-xs">
                                  <span className="w-20 truncate font-medium">
                                    {IndustryOptions[ind] ?? "その他"}
                                  </span>
                                  <Progress value={pct} className="h-1.5 flex-1" />
                                  <span className="w-8 text-right text-muted-foreground">{pct}%</span>
                                </div>
                              );
                            })}
                        </div>
                        {(() => {
                          const top = Array.from(aiSummary.industryBreakdown.entries()).sort((a, b) => b[1] - a[1])[0];
                          const topPct = totalBudget > 0 ? Math.round((top[1] / totalBudget) * 100) : 0;
                          if (topPct >= 60) {
                            return (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                ⚠ {IndustryOptions[top[0]] ?? "1業種"}に {topPct}% 集中 — 業種リスク分散を検討
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右カラム: ニュース */}
        <div className="lg:col-span-2 space-y-6">
          <TerritoryNews />
        </div>
      </div>

      {/* フォームモーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "テリトリー編集" : "テリトリー追加"}
        onSave={() => submitRef.current?.()}
        isSaving={createMut.isPending || updateMut.isPending}
      >
        <TerritoryForm
          item={editItem}
          customers={customers}
          customerMap={customerMap}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="テリトリーを削除"
        description={`「${deleteTarget?.geek_name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMut.mutate(deleteTarget.geek_territoryid, {
              onSuccess: () => { setDeleteTarget(null); setIsFormOpen(false); setEditItem(null); },
            });
          }
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

// ── テリトリーフォーム ──
function TerritoryForm({
  item,
  customers,
  customerMap,
  onSubmit,
  onDelete,
  submitRef,
}: {
  item: Territory | null;
  customers: Customer[];
  customerMap: Map<string, string>;
  onSubmit: (data: Partial<TerritoryCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [customerId, setCustomerId] = useState(item?._geek_customerid_value ?? "");
  const [budget, setBudget] = useState(item?.geek_budget?.toString() ?? "");
  const [fiscalYear, setFiscalYear] = useState(
    item?.geek_fiscalyear?.toString() ?? new Date().getFullYear().toString(),
  );
  const [notes, setNotes] = useState(item?.geek_notes ?? "");

  const doSubmit = () => {
    if (!customerId) return;
    const customerName = customerMap.get(customerId) ?? "";
    const name = `${customerName} ${fiscalYear}`;
    const data: Partial<TerritoryCreate> = {
      geek_name: name,
      ...(budget && { geek_budget: Number(budget) }),
      ...(fiscalYear && { geek_fiscalyear: Number(fiscalYear) }),
      ...(notes && { geek_notes: notes }),
      ...(customerId && {
        "geek_customerid@odata.bind": `/geek_customers(${customerId})`,
      } as unknown as Partial<TerritoryCreate>),
    };
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>顧客 <span className="text-red-500">*</span></Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className={!customerId ? "border-red-300" : ""}>
            <SelectValue placeholder="顧客を選択..." />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.geek_customerid} value={c.geek_customerid}>
                {c.geek_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>予算（円） <span className="text-red-500">*</span></Label>
          <Input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="10000000"
            className={!budget ? "border-red-300" : ""}
          />
        </div>
        <div>
          <Label>会計年度</Label>
          <Input
            type="number"
            min={2000}
            max={2100}
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label>メモ</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="補足情報..."
        />
      </div>
      {onDelete && (
        <div className="pt-2 border-t">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />削除
          </Button>
        </div>
      )}
    </div>
  );
}
