import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  PhoneCall,
  type LucideIcon,
} from "lucide-react"

export const GUIDE_STORAGE_KEY = "field-service-guide-v1"

export type GuideSlide = {
  id: string
  icon: LucideIcon
  title: string
  lead: string
  points: string[]
}

export const GUIDE_SLIDES: GuideSlide[] = [
  {
    id: "welcome",
    icon: BookOpenCheck,
    title: "フィールドサービス管理へようこそ",
    lead: "受付から現場対応、作業報告までをつなぎ、日々の保守業務をひとつの画面で管理します。",
    points: ["コールと作業オーダーを確認します", "担当者と訪問日時をスケジュールします", "作業結果を日報にまとめて提出します"],
  },
  {
    id: "calls",
    icon: PhoneCall,
    title: "受付から対応状況を追跡",
    lead: "コールの優先度やステータスを確認し、対応する作業オーダーへ進みます。",
    points: ["受付・対応中のコールを見つけます", "関連する作業オーダーを確認します", "サービスフローで工程全体を俯瞰します"],
  },
  {
    id: "scheduling",
    icon: CalendarDays,
    title: "ドラッグ＆ドロップで予定を調整",
    lead: "未割当オーダーを担当者の時間枠へ移動し、訪問日時を設定します。",
    points: ["未割当一覧からオーダーを選びます", "担当者のカレンダーへドラッグします", "日・週表示とエリア別表示を切り替えます"],
  },
  {
    id: "reports",
    icon: ClipboardCheck,
    title: "完了・署名を確認して日報を提出",
    lead: "日報には対象の作業オーダーを紐づけ、作業完了と顧客署名を確認してから提出します。",
    points: ["作業内容と顧客署名を確認します", "完了したオーダーを日報へまとめます", "提出後は承認または差戻しを行います"],
  },
  {
    id: "insights",
    icon: BarChart3,
    title: "状況をダッシュボードで把握",
    lead: "運用データの集計を確認し、デモ用データは通常の業務集計と分けて扱います。",
    points: ["自分の担当状況を確認します", "全体の受付・完了状況を見ます", "必要に応じて顧客・機器情報を参照します"],
  },
]

export type TourStep = {
  id: string
  path?: string
  target?: string
  autoClick?: string
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  { id: "navigation", path: "/dashboard", target: "sidebar-nav", title: "メニューから画面を移動", body: "業務の流れに沿って、受付・作業・日報・分析の各画面を開けます。" },
  { id: "dashboard", path: "/dashboard", target: "dashboard-overview", title: "まず全体状況を確認", body: "担当者の状況と運用KPIを確認します。デモデータは通常の集計から除外して表示します。" },
  { id: "flow", path: "/service-flow", target: "service-flow-map", title: "業務工程を俯瞰", body: "受付、現場対応、完了・日報をカテゴリ別に表示します。拡大・縮小やドラッグ移動もできます。" },
  { id: "calls", path: "/calls", target: "calls-list", title: "コールの受付内容を確認", body: "優先度やステータスで絞り込み、対応が必要なコールを確認します。デモデータは必要なときだけ一覧へ含められます。" },
  { id: "queue", path: "/scheduling", target: "unassigned-queue", title: "未割当オーダーを選択", body: "左側の未割当一覧から、担当者と日時がまだ決まっていないオーダーを選びます。" },
  { id: "calendar", path: "/scheduling", target: "schedule-calendar", title: "時間枠へドラッグ", body: "担当者の時間枠にドロップすると、担当者と訪問予定を設定できます。日・週表示を切り替えられます。" },
  { id: "work-orders", path: "/work-orders", target: "work-orders-list", title: "作業オーダーを確認", body: "状態・作業内容を確認し、必要な情報を更新します。" },
  { id: "daily-reports", path: "/daily-reports", target: "daily-reports-list", title: "日報を作成して提出", body: "作業オーダーを日報へまとめ、完了・顧客署名を確認してから提出します。" },
  { id: "help", path: "/dashboard", target: "guide-button", title: "ガイドはいつでも再表示", body: "ヘッダーの「使い方」から、このガイドと画面ツアーをいつでも開けます。" },
]
