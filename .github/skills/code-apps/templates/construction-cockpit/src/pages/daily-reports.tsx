import { useQuery } from "@tanstack/react-query"
import { Camera } from "lucide-react"
import { ConstructionService, type DailyReport } from "@/services/construction-service"
import { RecordExplorer } from "@/components/records/record-explorer"
import { Breakdown, LineTrend } from "@/components/records/record-charts"
import { formatDate, optionsOf, useLookups } from "@/components/records/use-lookups"
import { PERIOD_OPTIONS, REVIEW_COLOR, REVIEW_LABEL, REVIEW_STATUS, WEATHER_LABEL, withinDays } from "@/lib/record-labels"

export default function DailyReports() {
  const reports = useQuery({ queryKey: ["reports"], queryFn: ConstructionService.reports })
  const lookups = useLookups()
  return (
    <RecordExplorer<DailyReport>
      tourId="report-list"
      eyebrow="夕方の報告"
      title="日報"
      description="現場からの日報です。人員の推移と監督確認の状況を確認し、記録をクリックすると詳細の確認・承認・差戻しができます。"
      items={reports.data}
      isLoading={reports.isLoading || lookups.isLoading}
      error={reports.error ?? lookups.error}
      rowKey={(item) => item.id}
      rowHref={(item) => `/reports/${item.id}`}
      rowLabel={(item) => `${formatDate(item.reportDate)} ${lookups.projectName(item.projectId)}`}
      newHref="/reports/new"
      newLabel="日報を作成"
      emptyText="日報はまだありません。「日報を作成」または Copilot Studio から提出できます。"
      searchPlaceholder="作業内容・明日の予定・特記事項で検索"
      searchText={(item) => `${item.name} ${item.workDetail} ${item.nextPlan} ${item.remarks} ${item.photoCaption} ${lookups.projectName(item.projectId)}`}
      filters={[
        { key: "period", label: "期間", options: PERIOD_OPTIONS, defaultValue: "30", match: (item, value) => withinDays(item.reportDate, Number(value)) },
        { key: "project", label: "工事", options: lookups.projectOptions, match: (item, value) => item.projectId === value },
        { key: "review", label: "監督確認", options: optionsOf(REVIEW_LABEL), match: (item, value) => item.reviewStatus === Number(value) },
        { key: "weather", label: "天候", options: optionsOf(WEATHER_LABEL), match: (item, value) => item.weather === Number(value) },
        { key: "photo", label: "写真", options: [{ value: "yes", label: "写真あり" }, { value: "no", label: "写真なし" }], match: (item, value) => Boolean(item.photoUrl) === (value === "yes") },
      ]}
      summary={(items) => [
        { label: "日報件数", value: `${items.length} 件` },
        { label: "確認待ち", value: `${items.filter((item) => item.reviewStatus === REVIEW_STATUS.submitted).length} 件`, tone: "warn" },
        { label: "差戻し中", value: `${items.filter((item) => item.reviewStatus === REVIEW_STATUS.returned).length} 件`, tone: "danger" },
        { label: "延べ作業人員", value: `${items.reduce((sum, item) => sum + item.workers, 0).toLocaleString()} 人` },
      ]}
      charts={(items) => <>
        <LineTrend title="作業人員の推移" items={items} dateOf={(item) => item.reportDate} amountOf={(item) => item.workers} valueLabel="延べ人員" />
        <Breakdown title="監督確認の状況" items={items} groupOf={(item) => item.reviewStatus} labels={REVIEW_LABEL} colors={REVIEW_COLOR} />
      </>}
      columns={[
        { key: "date", header: "日付", render: (item) => formatDate(item.reportDate), sortValue: (item) => item.reportDate, className: "whitespace-nowrap" },
        { key: "project", header: "工事", render: (item) => lookups.projectName(item.projectId), sortValue: (item) => lookups.projectName(item.projectId) },
        { key: "weather", header: "天候", render: (item) => WEATHER_LABEL[item.weather] ?? "-" },
        { key: "workers", header: "人員", render: (item) => `${item.workers} 人`, sortValue: (item) => item.workers, className: "whitespace-nowrap text-right" },
        { key: "detail", header: "作業内容", render: (item) => <span className="line-clamp-2">{item.workDetail}</span> },
        {
          key: "review", header: "監督確認", sortValue: (item) => item.reviewStatus,
          render: (item) => <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black text-white" style={{ background: REVIEW_COLOR[item.reviewStatus] ?? "#94a3b8" }}>{REVIEW_LABEL[item.reviewStatus] ?? "-"}</span>,
        },
        { key: "photo", header: "写真", render: (item) => item.photoUrl ? <Camera className="h-4 w-4 text-cyan-600" aria-label="写真あり" /> : null },
      ]}
    />
  )
}
