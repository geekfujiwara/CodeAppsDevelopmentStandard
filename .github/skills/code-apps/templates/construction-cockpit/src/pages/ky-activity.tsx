import { useQuery } from "@tanstack/react-query"
import { ConstructionService, type KyActivity } from "@/services/construction-service"
import { RecordExplorer } from "@/components/records/record-explorer"
import { Breakdown, StackedTrend } from "@/components/records/record-charts"
import { formatDate, optionsOf, useLookups } from "@/components/records/use-lookups"
import { PERIOD_OPTIONS, RISK_COLOR, RISK_LABEL, WEATHER_LABEL, withinDays } from "@/lib/record-labels"

const RISK_SERIES = Object.entries(RISK_LABEL).map(([value, label]) => ({
  key: `risk${value}`, label: `危険度 ${label}`, color: RISK_COLOR[Number(value)], match: (item: KyActivity) => item.riskLevel === Number(value),
}))

export default function KyActivities() {
  const ky = useQuery({ queryKey: ["ky"], queryFn: ConstructionService.kyActivities })
  const lookups = useLookups()
  return (
    <RecordExplorer<KyActivity>
      tourId="ky-list"
      eyebrow="朝の安全活動"
      title="KY 活動"
      description="作業前の危険予知の記録です。危険度の傾向を確認し、記録をクリックすると詳細と AI 予測の根拠を確認できます。"
      items={ky.data}
      isLoading={ky.isLoading || lookups.isLoading}
      error={ky.error ?? lookups.error}
      rowKey={(item) => item.id}
      rowHref={(item) => `/ky/${item.id}`}
      rowLabel={(item) => item.name}
      newHref="/ky/new"
      newLabel="KY を登録"
      emptyText="KY 活動の記録はまだありません。「KY を登録」または Copilot Studio から登録できます。"
      searchPlaceholder="作業内容・危険・対策・使用重機で検索"
      searchText={(item) => `${item.name} ${item.workDetail} ${item.hazards} ${item.countermeasures} ${item.equipment} ${lookups.projectName(item.projectId)} ${lookups.taskName(item.taskId)}`}
      filters={[
        { key: "period", label: "期間", options: PERIOD_OPTIONS, defaultValue: "90", match: (item, value) => withinDays(item.date, Number(value)) },
        { key: "project", label: "工事", options: lookups.projectOptions, match: (item, value) => item.projectId === value },
        { key: "risk", label: "危険度", options: optionsOf(RISK_LABEL), match: (item, value) => item.riskLevel === Number(value) },
        { key: "weather", label: "天候", options: optionsOf(WEATHER_LABEL), match: (item, value) => item.weather === Number(value) },
      ]}
      summary={(items) => [
        { label: "KY 実施件数", value: `${items.length} 件` },
        { label: "危険度「高」", value: `${items.filter((item) => item.riskLevel === 100000000).length} 件`, tone: "danger" },
        { label: "実施した工事", value: `${new Set(items.map((item) => item.projectId)).size} 件` },
        { label: "AI 予測を使用", value: `${items.filter((item) => item.aiPrediction).length} 件`, tone: "good" },
      ]}
      charts={(items) => <>
        <StackedTrend title="KY 実施件数の推移" items={items} dateOf={(item) => item.date} series={RISK_SERIES} />
        <Breakdown title="危険度の内訳" items={items} groupOf={(item) => item.riskLevel} labels={RISK_LABEL} colors={RISK_COLOR} />
      </>}
      columns={[
        { key: "date", header: "実施日", render: (item) => formatDate(item.date), sortValue: (item) => item.date, className: "whitespace-nowrap" },
        { key: "project", header: "工事", render: (item) => lookups.projectName(item.projectId), sortValue: (item) => lookups.projectName(item.projectId) },
        { key: "task", header: "作業", render: (item) => lookups.taskName(item.taskId) },
        { key: "detail", header: "作業内容", render: (item) => <span className="line-clamp-2">{item.workDetail}</span> },
        { key: "hazards", header: "想定される危険", render: (item) => <span className="line-clamp-2">{item.hazards}</span> },
        {
          key: "risk", header: "危険度", sortValue: (item) => -item.riskLevel,
          render: (item) => <span className="rounded-full px-2 py-0.5 text-xs font-black text-white" style={{ background: RISK_COLOR[item.riskLevel] ?? "#94a3b8" }}>{RISK_LABEL[item.riskLevel] ?? "-"}</span>,
        },
      ]}
    />
  )
}
