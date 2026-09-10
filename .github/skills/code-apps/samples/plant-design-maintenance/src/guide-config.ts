import {
  BookOpenCheck,
  Box,
  FileQuestion,
  LayoutDashboard,
  Layers,
  Wand2,
  Workflow,
  type LucideIcon,
} from "lucide-react"

/** 初回起動でガイドを出したかどうかを覚えるキー */
export const GUIDE_STORAGE_KEY =
  import.meta.env.VITE_GUIDE_STORAGE_KEY?.trim() || "plant-sample-guide-seen"

export type GuideSlide = {
  id: string
  icon: LucideIcon
  title: string
  lead: string
  points: string[]
}

/** 使い方カルーセルのスライド。1 枚 = 1 つの業務ステップにする */
export const GUIDE_SLIDES: GuideSlide[] = [
  {
    id: "plant-3d",
    icon: Box,
    title: "プラントを立体で確認する",
    lead: "サンプル設備の形状・属性・関連資料を同じ画面で確認できます。",
    points: [
      "設備タグや名称で検索すると、3D 上の対象設備にフォーカスします",
      "3D 上の設備を直接選んでも、右側に属性と関連資料が表示されます",
      "GLB を開くとローカルのモデルを表示します。ファイルはアップロードされません",
    ],
  },
  {
    id: "plant-designer",
    icon: Wand2,
    title: "設置ウィザードでプラントを組む",
    lead: "「プラント設計」では、ユニットを選ぶ → 敷地に置く → 接続する、の順で構成を作ります。",
    points: [
      "「オブジェクトを配置」でウィザードが開き、ギャラリーからユニットを選びます",
      "敷地図をクリックすると 0.5 m 刻みで位置が決まり、回転は 90 度単位です",
      "他ユニットや立入禁止区域と干渉する間は「配置可能」にならず、確定できません",
      "配置直後に接続候補が提示され、経路を 3D で見ながら確定できます",
      "「共有保存」で改訂として保存するまで、エージェントの索引には入りません",
    ],
  },
  {
    id: "welcome",
    icon: LayoutDashboard,
    title: "Knowledge Bridge へようこそ",
    lead: "現場の問い合わせを、根拠付きのナレッジに変えて次の設計へ返すためのアプリです。",
    points: [
      "ダッシュボードで KPI と滞留を確認します",
      "ライフサイクルで「いま何件がどの段階にあるか」を把握します",
      "台帳（問い合わせ / ナレッジ / 図面索引）で個別の明細を編集します",
    ],
  },
  {
    id: "lifecycle",
    icon: Workflow,
    title: "ライフサイクルで全体を見る",
    lead: "受付から公開までの 7 段階を矢羽で表示します。件数の偏りがそのままボトルネックです。",
    points: [
      "矢羽をクリックすると、その段階の明細だけに絞り込めます",
      "行をクリックすると問い合わせ / ナレッジの詳細画面へ移動します",
      "編集や削除は移動先の詳細画面で行います",
    ],
  },
  {
    id: "incidents",
    icon: FileQuestion,
    title: "問い合わせを記録する",
    lead: "5W1H と対象タグを揃えるほど、後段のナレッジ生成精度が上がります。",
    points: [
      "一覧で行をクリックすると、同じ画面の上部に詳細が開きます",
      "状態を「完了」にするとクローズ日時が自動で打刻されます",
      "完了した問い合わせがナレッジ化の対象になります",
    ],
  },
  {
    id: "knowledge",
    icon: BookOpenCheck,
    title: "ナレッジを承認する",
    lead: "出典のないナレッジは公開できません。承認の前に必ず根拠を確認します。",
    points: [
      "詳細で症状・対策・出典をレビューします",
      "「社内限定で承認」「公開可で承認」をワンクリックで切り替えます",
      "出典 0 件のナレッジは公開可にできません",
    ],
  },
  {
    id: "drawings",
    icon: Layers,
    title: "図面から辿る",
    lead: "図面の実体は Azure Files にあり、ここには検索キーとパスだけを持ちます。",
    points: [
      "図面を選ぶと、改訂・関連文書・設計特徴量がまとめて見られます",
      "特徴量のキー一致と近傍から、似た設計の図面を提案します",
      "エージェントは同じ索引を使って回答の根拠を示します",
    ],
  },
]

export type TourStep = {
  id: string
  /** 表示前に移動するルート。省略時は現在の画面のまま */
  path?: string
  /** ハイライト対象。data-tour 属性で指定する */
  target?: string
  /** このステップに入ったときに実際にクリックして見せる要素の data-tour */
  autoClick?: string
  title: string
  body: string
}

/** 「使い方を見る」で実際の画面を操作しながら案内する手順 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "nav",
    path: "/dashboard",
    target: "sidebar-nav",
    title: "メニューは 2 グループ",
    body: "上の「概要」で全体を掴み、下の「台帳」で明細を編集します。迷ったらこの順で辿ってください。",
  },
  {
    id: "dashboard",
    path: "/dashboard",
    target: "page-body",
    title: "まず KPI を確認",
    body: "ナレッジ化率と公開可率が、この基盤が回っているかどうかの指標です。",
  },
  {
    id: "lifecycle-path",
    path: "/lifecycle",
    target: "lifecycle-path",
    autoClick: "lifecycle-stage-resolved",
    title: "段階を選ぶ",
    body: "矢羽をクリックすると、その段階の明細だけが下の一覧に表示されます。いま「解決済み」を選んでみました。",
  },
  {
    id: "lifecycle-list",
    path: "/lifecycle",
    target: "lifecycle-list",
    title: "行から詳細へ",
    body: "行をクリックすると問い合わせ / ナレッジの詳細画面に移動します。編集はそちらで行います。",
  },
  {
    id: "incident-list",
    path: "/incidents",
    target: "incident-list",
    title: "問い合わせの一覧と詳細",
    body: "検索・絞り込みで対象を見つけ、行をクリックすると同じ画面に詳細が開きます。",
  },
  {
    id: "knowledge-list",
    path: "/knowledge",
    target: "knowledge-list",
    title: "ナレッジの承認",
    body: "出典を確認してから「公開可で承認」を押します。出典が無いものは公開できません。",
  },
  {
    id: "drawings",
    path: "/drawings",
    target: "drawing-list",
    title: "図面索引",
    body: "図面を選ぶと改訂・関連文書・設計特徴量・類似図面がまとめて確認できます。",
  },
  {
    id: "designer-tabs",
    path: "/plant-designer",
    target: "designer-tabs",
    title: "プラント設計の 3 ビュー",
    body: "「配置」でユニットを置き、「接続」で配管・電源の経路を整え、「共有・提案」で改訂と提案を扱います。",
  },
  {
    id: "designer-place",
    path: "/plant-designer",
    target: "designer-place",
    title: "設置ウィザードを開く",
    body: "ここからウィザードが開きます。ギャラリーでユニットを選び、敷地図をクリックして 0.5 m 刻みで位置を決め、90 度単位で向きを揃えて「この場所に配置」で確定します。干渉や立入禁止区域と重なる間は確定できません。",
  },
  {
    id: "designer-connect",
    path: "/plant-designer",
    target: "designer-auto-connect",
    title: "配置の次は接続",
    body: "これをオンにしておくと、配置直後に接続候補が一覧で出ます。候補を選ぶと経路が 3D にプレビューされ、「接続を確定」で反映されます。",
  },
  {
    id: "designer-save",
    path: "/plant-designer",
    target: "designer-save",
    title: "改訂として共有保存",
    body: "配置と接続が固まったら共有保存します。保存して初めて設計が改訂として残り、エージェントの回答根拠に使えるようになります。",
  },
  {
    id: "help",
    path: "/plant-3d",
    target: "guide-button",
    title: "いつでも呼び出せます",
    body: "このボタンから、使い方カルーセルとこのガイドをもう一度開けます。",
  },
]
