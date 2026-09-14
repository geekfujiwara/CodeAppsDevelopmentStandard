import { Bot, ClipboardList, DraftingCompass, GitCompare, MousePointerClick, type LucideIcon } from "lucide-react"

/** 初回起動でガイドを出したかどうかを覚えるキー */
export const GUIDE_STORAGE_KEY = import.meta.env.VITE_GUIDE_STORAGE_KEY?.trim() || "drawing-communication-poc-guide-seen"

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
    icon: DraftingCompass,
    title: "図面コミュニケーションへようこそ",
    lead: "図面を見ながら指摘・依頼・タスク化までを 1 つの画面で回す、設計レビューの PoC です。",
    points: ["テンプレートを選んで寸法を入力します", "図面をクリックして指摘を残します", "依頼を送って候補を差分で確認します"],
  },
  {
    id: "drawing",
    icon: MousePointerClick,
    title: "寸法を直すと図が変わります",
    lead: "図形は保存された座標ではなく、寸法パラメーターから毎回生成しています。",
    points: ["「寸法・表題欄」タブで値を編集します", "範囲外の値は入力時に止まります", "SVG / PDF はその場で書き出せます"],
  },
  {
    id: "annotation",
    icon: ClipboardList,
    title: "指摘は注釈、対応はタスク",
    lead: "図面上の位置と一緒に指摘を残し、担当者・期限・状態を管理します。",
    points: ["注釈にコメントを追加できます", "「タスクにする」でカンバンへ送ります", "タスク画面で状態を進めます"],
  },
  {
    id: "conversation",
    icon: Bot,
    title: "依頼は非同期で返ってきます",
    lead: "Dataverse 未接続のときは DEMO ワーカー（ローカル寸法規則）が応答します。AI の応答ではありません。",
    points: ["Pending → Running → Completed を表示します", "待っている間に図面を編集すると結果は破棄されます", "同じターンの再送は拒否されます"],
  },
  {
    id: "review",
    icon: GitCompare,
    title: "候補は差分を見てから採用",
    lead: "届いた候補 JSON は検証を通ったものだけが「未審査の候補」として並びます。",
    points: ["差分を見てから採用・却下します", "採用しても元に戻せます", "改訂の保存は明示操作です"],
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
  { id: "nav", path: "/workbench", target: "sidebar-nav", title: "3 つの画面", body: "ワークベンチ・タスク・改訂と候補を行き来します。" },
  { id: "canvas", path: "/workbench", target: "drawing-canvas", title: "A3 の図面", body: "用紙 420 × 297 mm をそのまま表示しています。クリックした位置がそのまま注釈の座標になります。" },
  { id: "template", path: "/workbench", target: "template-select", title: "テンプレート選択", body: "ノート PC 外観図・横形ポンプ総組立図・汎用機器配置図の 3 種類を切り替えられます。" },
  { id: "parameters", path: "/workbench", target: "parameter-form", title: "寸法の編集", body: "値を変えると図が再生成されます。範囲外の入力は受け付けません。" },
  { id: "annotations", path: "/workbench", target: "annotation-list", title: "注釈とコメント", body: "状態・担当者・期限を設定し、対応が必要なものはタスクにします。" },
  { id: "chat", path: "/workbench", target: "conversation-panel", title: "非同期の依頼", body: "会話 ID・編集バージョン・基準ハッシュを添えて送り、戻ってきた結果は同じ組み合わせのときだけ受け入れます。" },
  { id: "kanban", path: "/tasks", target: "kanban", title: "タスクのカンバン", body: "未着手から完了まで矢印で進めます。期限超過は赤で表示します。" },
  { id: "proposals", path: "/revisions", target: "proposals", title: "候補の採用と取り消し", body: "差分を確認してから採用します。採用後も元に戻せます。" },
  { id: "help", path: "/workbench", target: "guide-button", title: "いつでも呼び出せます", body: "このガイドはヘッダーのボタンから再表示できます。" },
]
