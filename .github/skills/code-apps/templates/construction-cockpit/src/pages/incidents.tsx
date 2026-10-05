import { useQuery } from "@tanstack/react-query"
import { ConstructionService, type Incident } from "@/services/construction-service"
import { RecordExplorer } from "@/components/records/record-explorer"
import { Breakdown, StackedTrend } from "@/components/records/record-charts"
import { formatDateTime, optionsOf, useLookups } from "@/components/records/use-lookups"
import { INCIDENT_TYPE_COLOR, INCIDENT_TYPE_LABEL, PERIOD_OPTIONS, withinDays } from "@/lib/record-labels"

const TYPE_SERIES = Object.entries(INCIDENT_TYPE_LABEL).map(([value, label]) => ({
  key: `type${value}`, label, color: INCIDENT_TYPE_COLOR[Number(value)], match: (item: Incident) => item.incidentType === Number(value),
}))

export default function Incidents() {
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: ConstructionService.incidents })
  const lookups = useLookups()
  return (
    <RecordExplorer<Incident>
      tourId="incident-list"
      eyebrow="その場で記録"
      title="ヒヤリハット"
      description="危険な気づき・事故・品質トラブルの記録です。区分ごとの傾向を確認し、記録をクリックすると原因・対策とナレッジ化を確認できます。"
      items={incidents.data}
      isLoading={incidents.isLoading || lookups.isLoading}
      error={incidents.error ?? lookups.error}
      rowKey={(item) => item.id}
      rowHref={(item) => `/incidents/${item.id}`}
      rowLabel={(item) => item.name}
      newHref="/incidents/new"
      newLabel="ヒヤリハットを登録"
      emptyText="ヒヤリハットの記録はまだありません。「ヒヤリハットを登録」または Copilot Studio から登録できます。"
      searchPlaceholder="件名・内容・原因・対策で検索"
      searchText={(item) => `${item.name} ${item.description} ${item.cause} ${item.countermeasure} ${lookups.projectName(item.projectId)} ${lookups.workTypeName(item.workTypeId)}`}
      filters={[
        { key: "period", label: "期間", options: PERIOD_OPTIONS, defaultValue: "365", match: (item, value) => withinDays(item.occurredOn, Number(value)) },
        { key: "project", label: "工事", options: lookups.projectOptions, match: (item, value) => item.projectId === value },
        { key: "type", label: "区分", options: optionsOf(INCIDENT_TYPE_LABEL), match: (item, value) => item.incidentType === Number(value) },
        { key: "worktype", label: "工種", options: lookups.workTypeOptions, match: (item, value) => item.workTypeId === value },
        { key: "knowledge", label: "ナレッジ化", options: [{ value: "done", label: "ナレッジ化済み" }, { value: "todo", label: "未ナレッジ化" }], match: (item, value) => item.knowledgeCreated === (value === "done") },
      ]}
      summary={(items) => [
        { label: "記録件数", value: `${items.length} 件` },
        { label: "事故（軽微な事故）", value: `${items.filter((item) => item.incidentType === 100000001).length} 件`, tone: "danger" },
        { label: "30 日以内", value: `${items.filter((item) => withinDays(item.occurredOn, 30)).length} 件`, tone: "warn" },
        { label: "未ナレッジ化", value: `${items.filter((item) => !item.knowledgeCreated).length} 件`, tone: items.some((item) => !item.knowledgeCreated) ? "warn" : "good" },
      ]}
      charts={(items) => <>
        <StackedTrend title="発生件数の推移" items={items} dateOf={(item) => item.occurredOn} series={TYPE_SERIES} />
        <Breakdown title="工種別の発生件数" items={items} groupOf={(item) => lookups.workTypeName(item.workTypeId)} variant="bar" />
      </>}
      columns={[
        { key: "occurred", header: "発生日時", render: (item) => formatDateTime(item.occurredOn), sortValue: (item) => item.occurredOn, className: "whitespace-nowrap" },
        { key: "name", header: "件名", render: (item) => item.name, sortValue: (item) => item.name },
        { key: "project", header: "工事", render: (item) => lookups.projectName(item.projectId), sortValue: (item) => lookups.projectName(item.projectId) },
        {
          key: "type", header: "区分", sortValue: (item) => item.incidentType,
          render: (item) => <span className="rounded-full px-2 py-0.5 text-xs font-black text-white" style={{ background: INCIDENT_TYPE_COLOR[item.incidentType] ?? "#94a3b8" }}>{INCIDENT_TYPE_LABEL[item.incidentType] ?? "-"}</span>,
        },
        { key: "worktype", header: "工種", render: (item) => lookups.workTypeName(item.workTypeId) },
        { key: "knowledge", header: "ナレッジ化", render: (item) => item.knowledgeCreated ? <span className="font-bold text-emerald-600">済</span> : <span className="font-bold text-amber-600">未</span>, sortValue: (item) => Number(item.knowledgeCreated) },
      ]}
    />
  )
}
