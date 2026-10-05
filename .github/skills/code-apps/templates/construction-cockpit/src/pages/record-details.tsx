import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { BookOpen, CheckCircle2, Pencil, RotateCcw, Save, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { GoogleMapEmbed } from "@/components/google-map-embed"
import { SitePhoto } from "@/components/site-photo"
import { Badge, Field, FieldGrid, RecordDetail, RelatedList, Section } from "@/components/records/record-detail"
import { formatDate, formatDateTime, useLookups } from "@/components/records/use-lookups"
import { ConstructionService } from "@/services/construction-service"
import type { DataverseRow } from "@/lib/dataverse-client"
import {
  INCIDENT_TYPE_COLOR, INCIDENT_TYPE_LABEL, KNOWLEDGE_TYPE_COLOR, KNOWLEDGE_TYPE_LABEL, REPORT_STATUS_LABEL,
  REVIEW_COLOR, REVIEW_LABEL, REVIEW_STATUS, RISK_COLOR, RISK_LABEL, WEATHER_LABEL,
} from "@/lib/record-labels"

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"

type EditField = { key: string; label: string; kind: "text" | "textarea" | "select"; options?: Record<number, string> }

/** 記録のメンテナンス（項目の修正）。保存すると Dataverse を更新し、一覧・ワークスペースにも反映する */
function EditPanel({ fields, initial, onSave, saving }: { fields: EditField[]; initial: Record<string, string | number>; onSave: (body: DataverseRow) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const start = () => { setValues(Object.fromEntries(fields.map((field) => [field.key, String(initial[field.key] ?? "")]))); setEditing(true) }
  if (!editing) return <Button variant="outline" onClick={start}><Pencil className="mr-1 h-4 w-4" />記録を修正する</Button>
  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault()
      const body = Object.fromEntries(fields.map((field) => [field.key, field.kind === "select" ? Number(values[field.key]) : values[field.key]]))
      onSave(body)
      setEditing(false)
    }} data-record-edit>
      {fields.map((field) => (
        <label key={field.key} className="block text-sm font-bold">{field.label}
          {field.kind === "textarea" ? <textarea className={inputClass} rows={3} value={values[field.key]} onChange={(event) => setValues((value) => ({ ...value, [field.key]: event.target.value }))} />
            : field.kind === "select" ? <select className={inputClass} value={values[field.key]} onChange={(event) => setValues((value) => ({ ...value, [field.key]: event.target.value }))}>{Object.entries(field.options ?? {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              : <input className={inputClass} value={values[field.key]} onChange={(event) => setValues((value) => ({ ...value, [field.key]: event.target.value }))} />}
        </label>
      ))}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "保存中…" : "保存"}</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}><X className="mr-1 h-4 w-4" />取消</Button>
      </div>
    </form>
  )
}

function useSave(queryKey: string, update: (body: DataverseRow) => Promise<unknown>, message = "記録を更新しました") {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: update,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: [queryKey] }); toast.success(message) },
    onError: (error) => toast.error(`更新できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })
}

function WorkspaceLink({ projectId, children }: { projectId: string; children?: ReactNode }) {
  return <Link to={`/projects/${projectId}`} className="font-bold text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300">{children ?? "工事ワークスペースを開く"}</Link>
}

// ---------------------------------------------------------------------------
// KY 活動
// ---------------------------------------------------------------------------
type Prediction = { source?: string; risks?: Array<{ title: string; description: string; countermeasure: string; level: string; sourceKnowledgeTitles?: string[] }> }

function parsePrediction(text: string): Prediction | undefined {
  try { return text ? JSON.parse(text) as Prediction : undefined } catch { return undefined }
}

export function KyDetail() {
  const { id = "" } = useParams()
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const lookups = useLookups()
  const save = useSave("ky", (body) => ConstructionService.updateKy(id, body))
  const item = ky.data?.find((row) => row.id === id)
  const task = item ? lookups.task.get(item.taskId) : undefined
  const prediction = item ? parsePrediction(item.aiPrediction) : undefined
  const cited = new Set(prediction?.risks?.flatMap((risk) => risk.sourceKnowledgeTitles ?? []) ?? [])
  const related = (knowledge.data ?? []).filter((row) => cited.has(row.name) || (task && row.workTypeId === task.workTypeId)).slice(0, 6)
  const others = (ky.data ?? []).filter((row) => item && row.id !== item.id && row.taskId === item.taskId).slice(0, 5)
  return (
    <RecordDetail
      tourId="ky-detail" backTo="/ky" backLabel="KY 活動の一覧へ" eyebrow="KY 活動"
      title={item?.workDetail || item?.name || ""}
      isLoading={ky.isLoading || lookups.isLoading} error={ky.error ?? lookups.error} notFound={!item}
      badges={item && <>
        <Badge color={RISK_COLOR[item.riskLevel] ?? "#94a3b8"}>危険度 {RISK_LABEL[item.riskLevel] ?? "-"}</Badge>
        <Badge color="#e2e8f0">{WEATHER_LABEL[item.weather] ?? "天候未設定"}</Badge>
        {item.aiPrediction && <Badge color="#a5f3fc">AI 予測あり</Badge>}
      </>}
      meta={item && <>{formatDate(item.date)} · {lookups.projectName(item.projectId)}{task ? ` · ${task.name}` : ""}</>}
      aside={item && <>
        <Section title="工事"><p className="text-sm">{lookups.projectName(item.projectId)}</p><p className="mt-2 text-sm"><WorkspaceLink projectId={item.projectId} /></p></Section>
        <Section title="関連するナレッジ" description="AI 予測が根拠にしたナレッジと、同じ工種のナレッジ"><RelatedList empty="関連するナレッジはありません。" items={related.map((row) => ({ id: row.id, href: `/knowledge/${row.id}`, title: row.name, subtitle: row.lesson }))} /></Section>
        <Section title="同じ作業の KY"><RelatedList empty="ほかの記録はありません。" items={others.map((row) => ({ id: row.id, href: `/ky/${row.id}`, title: `${formatDate(row.date)} ${row.workDetail}`, subtitle: row.hazards }))} /></Section>
      </>}
    >
      {item && <>
        <Section title="作業と危険予知">
          <FieldGrid>
            <Field label="作業内容" wide>{item.workDetail}</Field>
            <Field label="使用する重機">{item.equipment}</Field>
            <Field label="作業">{task?.name}</Field>
            <Field label="想定される危険" wide>{item.hazards}</Field>
            <Field label="対策" wide>{item.countermeasures}</Field>
          </FieldGrid>
        </Section>
        <Section title="AI 危険予測" description={prediction?.source === "fallback" ? "AI を使わず、過去のナレッジから表示した予測です。" : "KY 危険予測エージェントの予測です。"}>
          {!prediction?.risks?.length ? <p className="text-sm text-slate-500">予測は記録されていません。</p> : (
            <div className="space-y-3">
              {prediction.risks.map((risk, index) => (
                <article key={`${risk.title}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2"><p className="font-black">{risk.title}</p><span className="text-xs font-black">{risk.level}</span></div>
                  <p className="mt-1 text-sm">{risk.description}</p>
                  <p className="mt-1 text-sm text-slate-500">対策: {risk.countermeasure}</p>
                </article>
              ))}
            </div>
          )}
        </Section>
        <Section title="メンテナンス" description="現場で見直した危険・対策・危険度を修正できます。">
          <EditPanel saving={save.isPending} onSave={(body) => save.mutate(body)} initial={{ ${PUBLISHER_PREFIX}_hazards: item.hazards, ${PUBLISHER_PREFIX}_countermeasures: item.countermeasures, ${PUBLISHER_PREFIX}_risklevel: item.riskLevel }} fields={[
            { key: "${PUBLISHER_PREFIX}_hazards", label: "想定される危険", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_countermeasures", label: "対策", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_risklevel", label: "危険度", kind: "select", options: RISK_LABEL },
          ]} />
        </Section>
      </>}
    </RecordDetail>
  )
}

// ---------------------------------------------------------------------------
// ヒヤリハット
// ---------------------------------------------------------------------------
export function IncidentDetail() {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const lookups = useLookups()
  const save = useSave("incidents", (body) => ConstructionService.updateIncident(id, body))
  const item = incidents.data?.find((row) => row.id === id)
  const convert = useMutation({
    mutationFn: () => ConstructionService.incidentToKnowledge(item!),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["incidents"] }), queryClient.invalidateQueries({ queryKey: ["knowledge"] })])
      toast.success("ナレッジ化しました。KY の危険予測に使われます。")
    },
    onError: (error) => toast.error(`ナレッジ化できませんでした: ${error instanceof Error ? error.message : "不明なエラー"}`),
  })
  const created = (knowledge.data ?? []).filter((row) => row.sourceIncidentId === id)
  const similar = (incidents.data ?? []).filter((row) => item && row.id !== item.id && row.workTypeId && row.workTypeId === item.workTypeId).slice(0, 5)
  return (
    <RecordDetail
      tourId="incident-detail" backTo="/incidents" backLabel="ヒヤリハットの一覧へ" eyebrow="ヒヤリハット"
      title={item?.name ?? ""}
      isLoading={incidents.isLoading || lookups.isLoading} error={incidents.error ?? lookups.error} notFound={!item}
      badges={item && <>
        <Badge color={INCIDENT_TYPE_COLOR[item.incidentType] ?? "#94a3b8"}>{INCIDENT_TYPE_LABEL[item.incidentType] ?? "区分未設定"}</Badge>
        <Badge color={item.knowledgeCreated ? "#6ee7b7" : "#fcd34d"}>{item.knowledgeCreated ? "ナレッジ化済み" : "未ナレッジ化"}</Badge>
      </>}
      meta={item && <>{formatDateTime(item.occurredOn)} · {lookups.projectName(item.projectId)}{item.taskId ? ` · ${lookups.taskName(item.taskId)}` : ""}{item.workTypeId ? ` · ${lookups.workTypeName(item.workTypeId)}` : ""}</>}
      actions={item && !item.knowledgeCreated && <Button onClick={() => convert.mutate()} disabled={convert.isPending}><BookOpen className="mr-1 h-4 w-4" />{convert.isPending ? "ナレッジ化中…" : "ナレッジ化する"}</Button>}
      aside={item && <>
        <Section title="工事"><p className="text-sm">{lookups.projectName(item.projectId)}</p><p className="mt-2 text-sm"><WorkspaceLink projectId={item.projectId} /></p></Section>
        <Section title="作成されたナレッジ"><RelatedList empty="まだナレッジ化されていません。" items={created.map((row) => ({ id: row.id, href: `/knowledge/${row.id}`, title: row.name, subtitle: row.lesson }))} /></Section>
        <Section title="同じ工種のヒヤリハット"><RelatedList empty="ほかの記録はありません。" items={similar.map((row) => ({ id: row.id, href: `/incidents/${row.id}`, title: row.name, subtitle: formatDateTime(row.occurredOn) }))} /></Section>
      </>}
    >
      {item && <>
        <Section title="発生した事象">
          <FieldGrid>
            <Field label="内容" wide>{item.description}</Field>
            <Field label="原因" wide>{item.cause}</Field>
            <Field label="対策" wide>{item.countermeasure}</Field>
          </FieldGrid>
        </Section>
        {Boolean(item.latitude || item.longitude) && (
          <Section title="発生場所"><GoogleMapEmbed latitude={item.latitude} longitude={item.longitude} label={item.name} className="h-64 rounded-xl" /></Section>
        )}
        <Section title="メンテナンス" description="原因・対策の追記や区分の修正ができます。">
          <EditPanel saving={save.isPending} onSave={(body) => save.mutate(body)} initial={{ ${PUBLISHER_PREFIX}_description: item.description, ${PUBLISHER_PREFIX}_cause: item.cause, ${PUBLISHER_PREFIX}_countermeasure: item.countermeasure, ${PUBLISHER_PREFIX}_incidenttype: item.incidentType }} fields={[
            { key: "${PUBLISHER_PREFIX}_description", label: "内容", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_cause", label: "原因", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_countermeasure", label: "対策", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_incidenttype", label: "区分", kind: "select", options: INCIDENT_TYPE_LABEL },
          ]} />
        </Section>
      </>}
    </RecordDetail>
  )
}

// ---------------------------------------------------------------------------
// 日報（監督確認: 承認・差戻し）
// ---------------------------------------------------------------------------
export function ReportDetail() {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const equipment = useQuery({ queryKey: ["equipment"], queryFn: ConstructionService.equipment })
  const usage = useQuery({ queryKey: ["equipment-usage"], queryFn: ConstructionService.equipmentUsage })
  const lookups = useLookups()
  const [comment, setComment] = useState("")
  const item = reports.data?.find((row) => row.id === id)
  const review = useMutation({
    mutationFn: (action: "approve" | "return") => ConstructionService.reviewReport(id, action, comment),
    onSuccess: async (_, action) => {
      await queryClient.invalidateQueries({ queryKey: ["reports"] })
      setComment("")
      toast.success(action === "approve" ? "日報を承認しました" : "日報を差し戻しました")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新できませんでした"),
  })
  const save = useSave("reports", (body) => ConstructionService.updateReport(id, body))
  const day = item ? formatDate(item.reportDate) : ""
  const sameDayKy = (ky.data ?? []).filter((row) => item && row.projectId === item.projectId && formatDate(row.date) === day)
  const sameDayIncidents = (incidents.data ?? []).filter((row) => item && row.projectId === item.projectId && formatDate(row.occurredOn) === day)
  const machines = (usage.data ?? []).filter((row) => row.reportId === id)
  const project = item ? lookups.project.get(item.projectId) : undefined
  const reviewable = item && (item.reviewStatus === REVIEW_STATUS.submitted || item.reviewStatus === REVIEW_STATUS.returned || item.reviewStatus === REVIEW_STATUS.draft)
  return (
    <RecordDetail
      tourId="report-detail" backTo="/reports" backLabel="日報の一覧へ" eyebrow="日報"
      title={item ? `${day} ${project?.name ?? ""}` : ""}
      isLoading={reports.isLoading || lookups.isLoading} error={reports.error ?? lookups.error} notFound={!item}
      badges={item && <>
        <Badge color={REVIEW_COLOR[item.reviewStatus] ?? "#94a3b8"}>{REVIEW_LABEL[item.reviewStatus] ?? "未提出"}</Badge>
        <Badge color="#e2e8f0">{REPORT_STATUS_LABEL[item.status] ?? "下書き"}</Badge>
        <Badge color="#e2e8f0" className="max-w-full break-words">{WEATHER_LABEL[item.weather] ?? "天候未設定"} · {item.workers} 人</Badge>
        {item.aiDrafted && <Badge color="#a5f3fc">支援下書き（Cowork / Copilot Studio）</Badge>}
      </>}
      meta={item?.name}
      aside={item && <>
        <Section title="監督確認" tour="report-review">
          {item.reviewComment && <p className={`mb-3 rounded-lg p-3 text-sm ${item.reviewStatus === REVIEW_STATUS.returned ? "bg-rose-50 text-rose-900" : "bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>前回のコメント: {item.reviewComment}</p>}
          {reviewable ? <>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="監督コメント（差戻し時は必須）" className={inputClass} rows={3} aria-label="監督コメント" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={review.isPending} onClick={() => review.mutate("approve")}><CheckCircle2 className="mr-1 h-4 w-4" />承認</Button>
              <Button variant="outline" disabled={review.isPending} onClick={() => review.mutate("return")}><RotateCcw className="mr-1 h-4 w-4" />差戻し</Button>
            </div>
          </> : <p className="text-sm text-emerald-700">承認済みです。修正が必要な場合は「記録を修正する」から更新してください。</p>}
        </Section>
        <Section title="工事"><p className="text-sm">{project?.name}</p><p className="mt-2 text-sm"><WorkspaceLink projectId={item.projectId} /></p></Section>
        <Section title="同じ日の KY"><RelatedList empty="記録はありません。" items={sameDayKy.map((row) => ({ id: row.id, href: `/ky/${row.id}`, title: row.workDetail, subtitle: `危険度 ${RISK_LABEL[row.riskLevel] ?? "-"}` }))} /></Section>
        <Section title="同じ日のヒヤリハット"><RelatedList empty="記録はありません。" items={sameDayIncidents.map((row) => ({ id: row.id, href: `/incidents/${row.id}`, title: row.name, subtitle: INCIDENT_TYPE_LABEL[row.incidentType] }))} /></Section>
      </>}
    >
      {item && <>
        {item.photoUrl && <figure className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"><SitePhoto photoUrl={item.photoUrl} caption={item.photoCaption} projectName={project?.name ?? ""} reportDate={item.reportDate} /><figcaption className="bg-white p-3 text-sm dark:bg-slate-900">{item.photoCaption}</figcaption></figure>}
        <Section title="報告内容">
          <FieldGrid>
            <Field label="作業内容" wide>{item.workDetail}</Field>
            <Field label="明日の予定" wide>{item.nextPlan}</Field>
            <Field label="特記事項" wide>{item.remarks}</Field>
          </FieldGrid>
        </Section>
        <Section title="重機の稼働">
          {!machines.length ? <p className="text-sm text-slate-500">稼働記録はありません。</p> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {machines.map((row) => <li key={row.id} className="flex justify-between py-2"><span>{equipment.data?.find((machine) => machine.id === row.equipmentId)?.name ?? row.name}</span><span className="font-bold">{row.hours} 時間</span></li>)}
            </ul>
          )}
        </Section>
        <Section title="メンテナンス" description="監督の指摘に合わせて報告内容を修正できます。">
          <EditPanel saving={save.isPending} onSave={(body) => save.mutate(body)} initial={{ ${PUBLISHER_PREFIX}_workdetail: item.workDetail, ${PUBLISHER_PREFIX}_nextplan: item.nextPlan, ${PUBLISHER_PREFIX}_remarks: item.remarks }} fields={[
            { key: "${PUBLISHER_PREFIX}_workdetail", label: "作業内容", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_nextplan", label: "明日の予定", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_remarks", label: "特記事項", kind: "textarea" },
          ]} />
        </Section>
      </>}
    </RecordDetail>
  )
}

// ---------------------------------------------------------------------------
// ナレッジ
// ---------------------------------------------------------------------------
export function KnowledgeDetail() {
  const { id = "" } = useParams()
  const knowledge = useQuery({ queryKey: ["knowledge"], queryFn: ConstructionService.knowledge })
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const lookups = useLookups()
  const save = useSave("knowledge", (body) => ConstructionService.updateKnowledge(id, body))
  const item = knowledge.data?.find((row) => row.id === id)
  const source = incidents.data?.find((row) => row.id === item?.sourceIncidentId)
  const citedBy = (ky.data ?? []).filter((row) => item && row.aiPrediction.includes(item.name)).slice(0, 6)
  const similar = (knowledge.data ?? []).filter((row) => item && row.id !== item.id && row.workTypeId === item.workTypeId).slice(0, 5)
  return (
    <RecordDetail
      tourId="knowledge-detail" backTo="/knowledge" backLabel="ナレッジ検索へ" eyebrow="ナレッジ"
      title={item?.name ?? ""}
      isLoading={knowledge.isLoading || lookups.isLoading} error={knowledge.error ?? lookups.error} notFound={!item}
      badges={item && <>
        <Badge color={KNOWLEDGE_TYPE_COLOR[item.knowledgeType] ?? "#94a3b8"}>{KNOWLEDGE_TYPE_LABEL[item.knowledgeType] ?? "区分未設定"}</Badge>
        {item.workTypeId && <Badge color="#e2e8f0">{lookups.workTypeName(item.workTypeId)}</Badge>}
      </>}
      meta={item?.keywords && <>キーワード: {item.keywords}</>}
      aside={item && <>
        <Section title="出典">{source ? <RelatedList empty="" items={[{ id: source.id, href: `/incidents/${source.id}`, title: source.name, subtitle: formatDateTime(source.occurredOn) }]} /> : <p className="text-sm text-slate-500">直接登録されたナレッジです。</p>}</Section>
        <Section title="このナレッジを根拠にした KY"><RelatedList empty="まだ引用されていません。" items={citedBy.map((row) => ({ id: row.id, href: `/ky/${row.id}`, title: row.workDetail, subtitle: formatDate(row.date) }))} /></Section>
        <Section title="同じ工種のナレッジ"><RelatedList empty="ほかのナレッジはありません。" items={similar.map((row) => ({ id: row.id, href: `/knowledge/${row.id}`, title: row.name, subtitle: row.lesson }))} /></Section>
      </>}
    >
      {item && <>
        <Section title="内容">
          <FieldGrid>
            <Field label="事象" wide>{item.event}</Field>
            <Field label="原因" wide>{item.cause}</Field>
            <Field label="教訓・対策" wide>{item.lesson}</Field>
          </FieldGrid>
        </Section>
        <Section title="メンテナンス" description="教訓の更新やキーワードの追加で、KY の危険予測に使われやすくなります。">
          <EditPanel saving={save.isPending} onSave={(body) => save.mutate(body)} initial={{ ${PUBLISHER_PREFIX}_event: item.event, ${PUBLISHER_PREFIX}_cause: item.cause, ${PUBLISHER_PREFIX}_lesson: item.lesson, ${PUBLISHER_PREFIX}_keywords: item.keywords, ${PUBLISHER_PREFIX}_knowledgetype: item.knowledgeType }} fields={[
            { key: "${PUBLISHER_PREFIX}_event", label: "事象", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_cause", label: "原因", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_lesson", label: "教訓・対策", kind: "textarea" },
            { key: "${PUBLISHER_PREFIX}_keywords", label: "キーワード（読点区切り）", kind: "text" },
            { key: "${PUBLISHER_PREFIX}_knowledgetype", label: "区分", kind: "select", options: KNOWLEDGE_TYPE_LABEL },
          ]} />
        </Section>
      </>}
    </RecordDetail>
  )
}
