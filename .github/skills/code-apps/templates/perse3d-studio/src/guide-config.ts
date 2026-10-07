import { Box, Cpu, FileImage, Footprints, LayoutDashboard, MessageSquare, Sofa, type LucideIcon } from "lucide-react"

/** 初回起動でガイドを出したかどうかを覚えるキー */
export const GUIDE_STORAGE_KEY = import.meta.env.VITE_GUIDE_STORAGE_KEY?.trim() || "perse3d-guide-seen"

export type GuideSlide = {
  id: string
  icon: LucideIcon
  title: string
  lead: string
  points: string[]
}

/** 使い方カルーセルのスライド。1 枚 = 1 つの業務ステップ */
export const GUIDE_SLIDES: GuideSlide[] = [
  {
    id: "welcome",
    icon: LayoutDashboard,
    title: "パース 3D 内見スタジオへようこそ",
    lead: "依頼主から受け取った 2D のパース・間取り図を 3D 化し、設計と営業が同じモデルで提案まで進めるアプリです。",
    points: [
      "ダッシュボードでステージごとの案件数を確認します",
      "案件ごとに「画像から 3D 化 → 3D 内見・提案 → Blender 出力」の順で進めます",
      "右上の ? からいつでもこのガイドを開けます",
    ],
  },
  {
    id: "analyze",
    icon: FileImage,
    title: "画像から 3D 化する",
    lead: "間取り図からは壁・窓・ドア・部屋を、外観パースからは外壁・屋根の色を自動で読み取ります。",
    points: [
      "間取り図は階ごとにアップロードし、図面の横幅（m）で縮尺を合わせます",
      "検出結果（赤=壁、青=窓、緑=掃き出し窓、橙=ドア）を見ながら濃さ・細線除去を調整します",
      "間取り図がなくても、間口・奥行・階数・屋根形状から標準プランを生成できます",
      "画像はブラウザ内で解析し、外部サービスへは送信しません",
    ],
  },
  {
    id: "walk",
    icon: Footprints,
    title: "3D で内見する",
    lead: "外観・ドールハウス・内見の 3 モードで建物を確認します。",
    points: [
      "内見モードは玄関前から始まり、W/A/S/D・矢印キー（スマホは画面のパッド）で歩けます",
      "部屋名ボタンやミニマップのクリックで、その場所へ移動できます",
      "時刻スライダーで日当たり、電球ボタンで室内照明を確認できます",
    ],
  },
  {
    id: "proposal",
    icon: MessageSquare,
    title: "設計と営業で提案をまとめる",
    lead: "カラーバリエーションを提案プランとして保存し、3D 上のピン付きコメントでやり取りします。",
    points: [
      "外壁・屋根・床のプリセットを選んで「保存」すると、サムネイル付きのプランになります",
      "コメントは「設計 / 営業 / 依頼主」の立場を付けて投稿し、クリックで同じ視点を再現します",
      "「内見リンク」で案件の 3D 内見画面を共有できます",
    ],
  },
  {
    id: "furniture",
    icon: Sofa,
    title: "家具と車を置く",
    lead: "「家具・車」タブで、部屋に合わせた家具と駐車場の車を自然に配置できます。",
    points: [
      "「全室に家具と車を配置」で、LDK・寝室・玄関・駐車場をおまかせで仕上げます",
      "カタログから選んで床をクリックすると、壁の近くなら壁に背を付けて部屋の内側を向きます",
      "ドア・掃き出し窓の前は通路として空け、背の高い家具は窓の前に置きません",
      "家具はドラッグで移動、R で回転、Delete で削除。色も変えられます。内見中は家具や車にぶつかります",
    ],
  },
  {
    id: "blender",
    icon: Cpu,
    title: "Blender で仕上げる",
    lead: "同じモデルを Blender に渡し、フォトリアル画像・360° パノラマ・日影図・詳細モデルを作ります。",
    points: [
      "「Blender 出力」タブでジョブ JSON をダウンロードし、Blender ワーカーで実行します",
      "生成された model.glb は「3D 内見・提案」タブで読み込めます",
      "メニューの「Blender 連携」で実際の出力サンプルと、ほかに Blender でできることを確認できます",
    ],
  },
  {
    id: "model",
    icon: Box,
    title: "モデルは JSON で受け渡し",
    lead: "建物は BuildingSpec（JSON）として保存され、AI 解析や Blender と同じ形式でやり取りします。",
    points: [
      "Copilot Studio / Azure OpenAI で画像を解析した JSON を取り込めます",
      "現在のモデルを JSON で書き出し、別の案件や Blender に再利用できます",
    ],
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

/** 「使い方を見る」で実際の画面を操作しながら案内する手順 */
export const TOUR_STEPS: TourStep[] = [
  { id: "nav", path: "/dashboard", target: "sidebar-nav", title: "メニュー", body: "ダッシュボード・案件・Blender 連携の 3 画面です。" },
  { id: "projects", path: "/projects", target: "new-project", title: "案件を作る", body: "依頼主からパースを受け取ったら、まず新規案件を作成します。作成後はそのまま画像の取り込みに進みます。" },
  { id: "card", path: "/projects", target: "project-card", title: "案件を開く", body: "カードをクリックすると「概要 / 画像から 3D 化 / 3D 内見・提案 / Blender 出力」のタブで作業できます。サンプル邸には 1F・2F の間取り図と外観パースが登録済みです。" },
  { id: "blender", path: "/blender", target: "blender-gallery", title: "Blender 連携", body: "Blender で生成したフォトリアル画像・360° パノラマ・日影図のサンプルと、追加でできることを紹介しています。" },
]
