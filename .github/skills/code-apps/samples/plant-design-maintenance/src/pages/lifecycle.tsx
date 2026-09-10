import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ListTable, type FilterConfig, type TableColumn } from "@/components/list-table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { LifecyclePath } from "@/components/lifecycle-path"
import {
  LIFECYCLE_STAGES,
  getStage,
  stageCount,
  stageIncidents,
  stageKnowledge,
  summarizeLifecycle,
  type LifecycleStageId,
} from "@/lib/lifecycle"
import {
  useIncidents,
  useKnowledgeEntries,
  type IncidentRecord,
  type IncidentStatus,
  type KnowledgeRecord,
  type KnowledgeStatus,
  type Visibility,
} from "@/data/kb-repository"

/** ステージから作成した新規レコードは、そのステージに現れる状態で初期化する */
const STAGE_DEFAULTS: Record<
  LifecycleStageId,
  { incidentStatus?: IncidentStatus; knowledgeStatus?: KnowledgeStatus; visibility?: Visibility }
> = {
  intake: { incidentStatus: "未対応" },
  triage: { incidentStatus: "対応中" },
  resolved: { incidentStatus: "完了" },
  draft: { knowledgeStatus: "未承認", visibility: "社内限定" },
  review: { knowledgeStatus: "要確認", visibility: "社内限定" },
  approved: { knowledgeStatus: "承認済み", visibility: "社内限定" },
  published: { knowledgeStatus: "承認済み", visibility: "公開可" },
}

function toOptions(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort().map((v) => ({ value: v, label: v }))
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`
}

export default function LifecyclePage() {
  const navigate = useNavigate()
  const incidentsQuery = useIncidents()
  const knowledgeQuery = useKnowledgeEntries()

  const [selectedId, setSelectedId] = useState<LifecycleStageId>("intake")

  const incidents = useMemo(() => incidentsQuery.data ?? [], [incidentsQuery.data])
  const knowledge = useMemo(() => knowledgeQuery.data ?? [], [knowledgeQuery.data])

  const stage = getStage(selectedId)
  const summary = useMemo(() => summarizeLifecycle(incidents, knowledge), [incidents, knowledge])
  const pathItems = useMemo(
    () => LIFECYCLE_STAGES.map((s) => ({ stage: s, count: stageCount(s, incidents, knowledge) })),
    [incidents, knowledge],
  )

  const stageIncidentRows = useMemo(() => stageIncidents(stage, incidents), [stage, incidents])
  const stageKnowledgeRows = useMemo(() => stageKnowledge(stage, knowledge), [stage, knowledge])

  const isLoading = incidentsQuery.isLoading || knowledgeQuery.isLoading
  const loadError = incidentsQuery.error ?? knowledgeQuery.error

  // 編集は台帳側の詳細画面に一本化する。ここでは遷移だけを担う
  const openIncident = (record: IncidentRecord) => navigate(`/incidents?id=${record.id}`)

  const openKnowledge = (record: KnowledgeRecord) => navigate(`/knowledge?id=${record.id}`)

  const createInStage = () => {
    const defaults = STAGE_DEFAULTS[selectedId]
    if (stage.kind === "incident") {
      navigate(`/incidents?new=1&status=${encodeURIComponent(defaults.incidentStatus ?? "未対応")}`)
      return
    }
    const status = encodeURIComponent(defaults.knowledgeStatus ?? "未承認")
    const visibility = encodeURIComponent(defaults.visibility ?? "社内限定")
    navigate(`/knowledge?new=1&status=${status}&visibility=${visibility}`)
  }

  const incidentColumns: TableColumn<IncidentRecord>[] = [
    { key: "title", label: "タイトル", sortable: true, render: (i) => <span className="font-medium">{i.title}</span> },
    { key: "tagLabel", label: "対象タグ" },
    { key: "zone", label: "ゾーン" },
    { key: "where", label: "発生場所" },
    { key: "when", label: "発生日時" },
    {
      key: "knowledgeGenerated",
      label: "資産化",
      align: "center",
      render: (i) =>
        i.knowledgeGenerated ? (
          <Badge variant="default">済み</Badge>
        ) : (
          <Badge variant="outline">未</Badge>
        ),
    },
  ]

  const knowledgeColumns: TableColumn<KnowledgeRecord>[] = [
    { key: "title", label: "タイトル", sortable: true, render: (k) => <span className="font-medium">{k.title}</span> },
    { key: "categoryName", label: "カテゴリ" },
    { key: "tagLabel", label: "対象タグ" },
    { key: "occurrenceCount", label: "発生件数", sortable: true, align: "right" },
    {
      key: "sourceCount",
      label: "出典",
      align: "center",
      render: (k) =>
        k.sourceCount > 0 ? (
          <Badge variant="secondary">{k.sourceCount} 件</Badge>
        ) : (
          <Badge variant="destructive">なし</Badge>
        ),
    },
    {
      key: "visibility",
      label: "公開範囲",
      render: (k) => <Badge variant={k.visibility === "公開可" ? "default" : "outline"}>{k.visibility || "社内限定"}</Badge>,
    },
  ]

  const incidentFilters: FilterConfig<IncidentRecord>[] = [
    { key: "zone", label: "ゾーン", options: toOptions(incidents.map((i) => i.zone)) },
    { key: "tagLabel", label: "対象タグ", options: toOptions(incidents.map((i) => i.tagLabel)) },
  ]

  const knowledgeFilters: FilterConfig<KnowledgeRecord>[] = [
    { key: "categoryName", label: "カテゴリ", options: toOptions(knowledge.map((k) => k.categoryName)) },
    { key: "visibility", label: "公開範囲", options: toOptions(knowledge.map((k) => k.visibility)) },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ナレッジライフサイクル</h1>
        <p className="text-muted-foreground">
          問い合わせが解決され、ナレッジとして承認・公開されるまでの流れを一望します。行をクリックすると台帳の詳細画面へ移動します。
        </p>
      </div>

      {isLoading ? (
        <LoadingSkeletonList count={5} />
      ) : loadError ? (
        <Card>
          <CardHeader>
            <CardTitle>データを取得できませんでした</CardTitle>
            <CardDescription className="[overflow-wrap:anywhere]">
              {loadError instanceof Error ? loadError.message : "Dataverse への接続を確認してください。"}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="問い合わせ 総数" value={`${summary.incidentTotal} 件`} />
            <SummaryTile label="ナレッジ 総数" value={`${summary.knowledgeTotal} 件`} />
            <SummaryTile label="ナレッジ化率" value={percent(summary.conversionRate)} hint="解決済みのうち資産化された割合" />
            <SummaryTile label="公開可率" value={percent(summary.publishedRate)} hint="ナレッジ全体のうち社外提示できる割合" />
          </div>

          <Card data-tour="lifecycle-path">
            <CardContent className="pt-6">
              <LifecyclePath items={pathItems} selectedId={selectedId} onSelect={setSelectedId} />
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{stage.label}</span> — {stage.caption}
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={createInStage}>
              <Plus className="mr-1 h-4 w-4" />
              {stage.kind === "incident" ? "問い合わせを追加" : "ナレッジを追加"}
            </Button>
          </div>

          <div data-tour="lifecycle-list">
            {stage.kind === "incident" ? (
              <ListTable<IncidentRecord>
                data={stageIncidentRows}
                columns={incidentColumns}
                title={`${stage.label}の問い合わせ`}
                description={`${stageIncidentRows.length} 件 — 行をクリックすると問い合わせの詳細へ移動します`}
                searchPlaceholder="タイトル・内容・タグ・場所で検索..."
                searchKeys={["title", "detail", "tagLabel", "where", "when"]}
                filters={incidentFilters}
                emptyMessage="この段階の問い合わせはありません"
                onRowClick={openIncident}
              />
            ) : (
              <ListTable<KnowledgeRecord>
                data={stageKnowledgeRows}
                columns={knowledgeColumns}
                title={`${stage.label}のナレッジ`}
                description={`${stageKnowledgeRows.length} 件 — 行をクリックするとナレッジの詳細へ移動します`}
                searchPlaceholder="タイトル・要約・症状・対策で検索..."
                searchKeys={["title", "summary", "symptom", "countermeasure", "tagLabel"]}
                filters={knowledgeFilters}
                emptyMessage="この段階のナレッジはありません"
                onRowClick={openKnowledge}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>}
      </CardContent>
    </Card>
  )
}
