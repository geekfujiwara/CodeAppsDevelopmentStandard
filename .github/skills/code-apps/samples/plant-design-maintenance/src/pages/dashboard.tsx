import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, Bot, BookOpenCheck, Box, Gauge, Layers, MapPin, Recycle, ShieldCheck, Timer, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/kpi-card"
import {
  ApprovalFunnelChart,
  CategoryBreakdownChart,
  DailyAnswerTrendChart,
  MonthlyTrendChart,
  SourceTypeChart,
} from "@/components/kpi-charts"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { PlantMap } from "@/components/plant-map"
import { usePlantAgentDock } from "@/hooks/use-plant-agent-dock"
import { useKbDataset } from "@/data/kb-dataset"
import { PLANT_SAMPLES } from "@/data/plant-catalog"
import { unresolvedFailures } from "@/data/plant-maintenance"
import { STATUS_COLOR, usePlantSites, type PlantSite } from "@/data/plant-site-repository"
import {
  computeApprovalFunnel,
  computeAutomationKpis,
  computeCategoryBreakdown,
  computeDailyAnswerTrend,
  computeMonthlyTrend,
  computeOperationalKpis,
  computePrimaryKpis,
  computeSourceTypeBreakdown,
} from "@/lib/kpi"

const PRIMARY_ICONS = [BookOpenCheck, Timer, ShieldCheck, Recycle]
const AUTOMATION_ICONS = [Bot, Layers, ShieldCheck, Gauge]
const FAILURE_STATUS_LABEL = { open: "未着手", investigating: "調査中", resolved: "完了" } as const

function nodeLabel(modelId: string, nodeId: string) {
  const node = PLANT_SAMPLES.find((sample) => sample.id === modelId)?.nodes.find((candidate) => candidate.id === nodeId)
  return node ? `${node.tag} ${node.name}` : nodeId
}

export default function Dashboard() {
  const { data, isLoading, isError, error } = useKbDataset()
  const sitesQuery = usePlantSites()
  const [trendDays, setTrendDays] = useState(30)
  const [selectedSite, setSelectedSite] = useState<PlantSite | null>(null)

  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data])
  const failures = useMemo(() => unresolvedFailures().slice(0, 8), [])
  const siteByModel = useMemo(() => new Map(sites.map((site) => [site.modelId, site])), [sites])

  usePlantAgentDock({
    unavailableReason: selectedSite ? undefined : "地図でプラントを選択してください。",
    selection: {
      modelId: selectedSite?.modelId ?? PLANT_SAMPLES[0].id,
      modelRevision: 1,
      nodeId: null,
      label: selectedSite ? `${selectedSite.name} / 図面全体` : "プラント未選択",
    },
  })

  if (isLoading) return <LoadingSkeletonGrid columns={4} count={8} variant="compact" />

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>データを取得できませんでした</CardTitle>
          <CardDescription className="[overflow-wrap:anywhere]">
            {error instanceof Error ? error.message : "Dataverse への接続を確認してください。"}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const automation = computeAutomationKpis(data)
  const primary = computePrimaryKpis(data)
  const operational = computeOperationalKpis(data)
  const dailyTrend = computeDailyAnswerTrend(data, trendDays)
  const sourceTypes = computeSourceTypeBreakdown(data.knowledge)
  const trend = computeMonthlyTrend(data)
  const funnel = computeApprovalFunnel(data.knowledge)
  const categories = computeCategoryBreakdown(data.knowledge)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ナレッジ運用ダッシュボード</h1>
        <p className="text-muted-foreground">
          図面・設計書・故障実績を横断したエージェントの回答自動化度と、ナレッジ蓄積の効率を Dataverse の実データだけで測定します。
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />プラント稼働状況</CardTitle>
          <CardDescription>
            登録済みの拠点 {sites.length} 件を日本地図にピン留めしています。ピンをクリックすると拠点の詳細が開きます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PlantMap sites={sites} selectedId={selectedSite?.id ?? null} onSelect={setSelectedSite} />
          {selectedSite ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold [overflow-wrap:anywhere]">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: STATUS_COLOR[selectedSite.status] }} aria-hidden="true" />
                    {selectedSite.name}
                  </p>
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    〒{selectedSite.postalCode} {selectedSite.address}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    稼働率 {selectedSite.utilization.toFixed(1)} % · 責任者 {selectedSite.manager || "—"} · 未解決の故障{" "}
                    {unresolvedFailures(selectedSite.modelId).length} 件
                  </p>
                </div>
                <Badge>{selectedSite.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={`/plant-sites?id=${selectedSite.id}`}><MapPin />拠点の詳細</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/plant-3d?plant=${encodeURIComponent(selectedSite.modelId)}`}><Box />プラント 3D</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/plant-designer"><Workflow />プラント設計</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                右下の Copilot ボタンから、この拠点について直接質問できます。
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ピンを選ぶと拠点の概要と、プラント 3D・プラント設計への導線が表示されます。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />未解決の故障
            <span className="text-sm font-normal text-muted-foreground">{unresolvedFailures().length} 件</span>
          </CardTitle>
          <CardDescription>
            「対応状況を横断で見る」から、故障・問い合わせ・ナレッジをまとめた画面へ移動します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {failures.map((failure) => (
            <div key={failure.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium [overflow-wrap:anywhere]">{failure.title}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {failure.occurredOn} · {siteByModel.get(failure.modelId)?.name ?? failure.modelId} · {nodeLabel(failure.modelId, failure.nodeId)} · {failure.location}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={failure.status === "open" ? "destructive" : "secondary"}>
                  {FAILURE_STATUS_LABEL[failure.status]}
                </Badge>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/traceability?failure=${encodeURIComponent(failure.id)}`}>対応状況を横断で見る</Link>
                </Button>
              </div>
            </div>
          ))}
          {!failures.length && <p className="text-sm text-muted-foreground">未解決の故障はありません。</p>}
          <Button variant="outline" className="w-full" asChild>
            <Link to="/traceability">未解決の故障をすべて見る</Link>
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">自動化 KPI</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {automation.map((kpi, index) => (
            <KpiCard key={kpi.id} kpi={kpi} icon={AUTOMATION_ICONS[index]} emphasis />
          ))}
        </div>
      </section>

      <DailyAnswerTrendChart trend={dailyTrend} days={trendDays} onDaysChange={setTrendDays} />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">蓄積 KPI</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {primary.map((kpi, index) => (
            <KpiCard key={kpi.id} kpi={kpi} icon={PRIMARY_ICONS[index]} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SourceTypeChart data={sourceTypes} />
        <MonthlyTrendChart data={trend} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">運用 KPI</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {operational.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ApprovalFunnelChart data={funnel} />
        <CategoryBreakdownChart data={categories} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>図面起点の回答フロー</CardTitle>
          <CardDescription>
            図面を起点に、関連文書と過去の故障実績を辿って根拠付きで回答し、確定した知見をナレッジに戻します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {["図面・改訂の特定", "関連文書と特徴量の参照", "類似図面・故障実績の照合", "根拠付き回答をナレッジ化"].map((step, index) => (
              <div key={step} className="min-w-0 rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-semibold text-primary">STEP {index + 1}</p>
                <p className="mt-1 font-medium [overflow-wrap:anywhere]">{step}</p>
              </div>
            ))}
          </div>
          <Button asChild className="mt-5">
            <Link to="/drawings">図面索引を開く</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
