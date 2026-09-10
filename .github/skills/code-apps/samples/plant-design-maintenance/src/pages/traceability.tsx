import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { AlertTriangle, BookOpenCheck, Box, FileQuestion, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { PLANT_SAMPLES } from "@/data/plant-catalog"
import {
  findFailure,
  inquiriesForFailure,
  repairsForFailure,
  unresolvedFailures,
} from "@/data/plant-maintenance"
import { useIncidents, useKnowledgeEntries } from "@/data/kb-repository"
import { usePlantSites } from "@/data/plant-site-repository"

const FAILURE_STATUS_LABEL = { open: "未着手", investigating: "調査中", resolved: "完了" } as const

function findNode(modelId: string, nodeId: string) {
  return PLANT_SAMPLES.find((sample) => sample.id === modelId)?.nodes.find((node) => node.id === nodeId) ?? null
}

export default function TraceabilityPage() {
  const [params, setParams] = useSearchParams()
  const failureId = params.get("failure")
  const sitesQuery = usePlantSites()
  const incidentsQuery = useIncidents()
  const knowledgeQuery = useKnowledgeEntries()

  const failure = failureId ? findFailure(failureId) : null
  const node = failure ? findNode(failure.modelId, failure.nodeId) : null
  const site = (sitesQuery.data ?? []).find((candidate) => candidate.modelId === failure?.modelId) ?? null

  const repairs = useMemo(() => (failure ? repairsForFailure(failure.id) : []), [failure])
  const inquiries = useMemo(() => (failure ? inquiriesForFailure(failure.id) : []), [failure])

  // 設備タグを共通キーにして、故障・問い合わせ・ナレッジを突き合わせる
  const incidents = useMemo(
    () => (node ? (incidentsQuery.data ?? []).filter((record) => record.tagLabel === node.tag) : []),
    [incidentsQuery.data, node],
  )
  const knowledge = useMemo(
    () => (node ? (knowledgeQuery.data ?? []).filter((record) => record.tagLabel === node.tag) : []),
    [knowledgeQuery.data, node],
  )

  if (!failure) {
    const open = unresolvedFailures()
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">横断ビュー</h1>
          <p className="text-muted-foreground">故障・問い合わせ・ナレッジを 1 つの設備タグで突き合わせて表示します。</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">未解決の故障 {open.length} 件</CardTitle>
            <CardDescription>対象を選ぶと、関連する問い合わせとナレッジを横断で表示します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {open.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setParams({ failure: record.id }, { replace: true })}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block font-medium [overflow-wrap:anywhere]">{record.title}</span>
                  <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {record.occurredOn} · {findNode(record.modelId, record.nodeId)?.tag ?? record.nodeId} · {record.location}
                  </span>
                </span>
                <Badge variant={record.status === "open" ? "destructive" : "secondary"}>
                  {FAILURE_STATUS_LABEL[record.status]}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  const isLoading = incidentsQuery.isLoading || knowledgeQuery.isLoading

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{failure.title}</h1>
          <p className="text-muted-foreground [overflow-wrap:anywhere]">
            {site?.name ?? failure.modelId} · {node ? `${node.tag} ${node.name}` : failure.nodeId} · {failure.location}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant={failure.status === "open" ? "destructive" : "secondary"}>
            {FAILURE_STATUS_LABEL[failure.status]}
          </Badge>
          <Button variant="outline" asChild>
            <Link to={`/plant-3d?plant=${encodeURIComponent(failure.modelId)}&node=${encodeURIComponent(failure.nodeId)}`}>
              <Box />3D で開く
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/traceability">一覧へ戻る</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-primary" />故障記録</CardTitle>
          <CardDescription>{failure.id} · 発生 {failure.occurredOn}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7">
          <p><strong>症状: </strong>{failure.symptom}</p>
          <p><strong>原因: </strong>{failure.cause ?? "未確定"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-primary" />対応状況 <span className="text-muted-foreground">{repairs.length} 件</span></CardTitle>
          <CardDescription>修理・点検の実施記録と予定。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {repairs.map((repair) => (
            <div key={repair.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{repair.performedOn}</span>
                <Badge variant={repair.status === "completed" ? "default" : "outline"}>
                  {repair.status === "completed" ? "実施済み" : "予定"}
                </Badge>
              </div>
              <p className="mt-1 [overflow-wrap:anywhere]">{repair.action}</p>
              <p className="mt-1 text-muted-foreground [overflow-wrap:anywhere]">{repair.result}</p>
            </div>
          ))}
          {!repairs.length && <p className="text-sm text-muted-foreground">対応記録はありません。</p>}
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSkeletonList count={3} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><FileQuestion className="h-4 w-4 text-primary" />問い合わせ</CardTitle>
              <CardDescription>この故障から起票された確認依頼と、同じ設備タグの台帳レコード。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {inquiries.map((record) => (
                <div key={record.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium [overflow-wrap:anywhere]">{record.title}</p>
                  <p className="text-xs text-muted-foreground">{record.openedOn} · {record.status}</p>
                  <p className="mt-1 [overflow-wrap:anywhere]">{record.answer ?? "回答待ち"}</p>
                </div>
              ))}
              {incidents.map((record) => (
                <Link key={record.id} to={`/incidents?id=${record.id}`} className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50">
                  <p className="font-medium [overflow-wrap:anywhere]">{record.title}</p>
                  <p className="text-xs text-muted-foreground">{record.when || "日時未設定"} · {record.status} · {record.tagLabel}</p>
                </Link>
              ))}
              {!inquiries.length && !incidents.length && (
                <p className="text-sm text-muted-foreground">紐づく問い合わせはありません。</p>
              )}
              <Button variant="outline" className="w-full" asChild>
                <Link to="/incidents">問い合わせ台帳を開く</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><BookOpenCheck className="h-4 w-4 text-primary" />ナレッジ</CardTitle>
              <CardDescription>同じ設備タグで蓄積済みのナレッジ。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {knowledge.map((record) => (
                <Link key={record.id} to={`/knowledge?id=${record.id}`} className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50">
                  <p className="font-medium [overflow-wrap:anywhere]">{record.title}</p>
                  <p className="text-xs text-muted-foreground">{record.status} · 出典 {record.sourceCount} 件 · 発生 {record.occurrenceCount} 件</p>
                </Link>
              ))}
              {!knowledge.length && <p className="text-sm text-muted-foreground">紐づくナレッジはまだありません。</p>}
              <Button variant="outline" className="w-full" asChild>
                <Link to="/lifecycle">ライフサイクルで確認する</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
