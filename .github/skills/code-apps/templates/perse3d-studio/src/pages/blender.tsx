import { ArrowRight, Box, Camera, CheckCircle2, Clapperboard, Cpu, FileImage, Glasses, Layers3, Lightbulb, Printer, ScanLine, Sofa, Sparkles, Sun, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PanoramaViewer } from "@/components/panorama-viewer"
import { MATERIAL_PRESETS } from "@/lib/building-spec"
// Code Apps は connect-src 'none'（fetch 不可）のため、Blender の数量出力はビルド時にバンドルする
import sampleQuantities from "@/data/blender-sample-quantities.json"

const BASE = "./samples/blender/"

const PIPELINE = [
  { icon: FileImage, title: "Code App", body: "パース・間取り図 → BuildingSpec（JSON）" },
  { icon: Workflow, title: "Blender ジョブ", body: "spec + 提案プラン + 出力指定を JSON で受け渡し" },
  { icon: Cpu, title: "Blender（ヘッドレス）", body: "build_from_spec.py がシーン生成・Cycles レンダリング" },
  { icon: Box, title: "成果物", body: "GLB / .blend / 外観・内観 / 360° / 日影図 / 数量" },
  { icon: Glasses, title: "内見・提案", body: "GLB を Code App で内見、画像は提案書・掲載に" },
]

const CAPABILITIES: { icon: typeof Sun; title: string; body: string; done: boolean; value: string }[] = [
  { icon: Camera, title: "フォトリアル外観・内観パース", body: "Cycles（GPU/OptiX 自動検出）で 2 点透視の外観と最大の部屋の内観を描画。ガラス越しの日だまり、AgX トーンマップ、天空光付き。", done: true, value: "パース外注の待ち時間をゼロに" },
  { icon: Layers3, title: "仕上げ材のリアルな質感", body: "外壁 5 種（サイディング・塗り壁・レンガ・板張り・ガルバ）× 屋根 3 種（スレート・瓦・立平）× 床 2 種（無垢・タイル）をプロシージャルシェーダーで実寸表現。アプリ内 3D も同じ質感。", done: true, value: "素材の違いを着工前に体感" },
  { icon: Box, title: "建築ディテールの自動生成", body: "基礎・玄関ポーチ・サッシ（引き違い）・水切り・窓台・額縁・巾木・扉・軒天・破風・雨樋・竪樋を間取りから自動で付与。", done: true, value: "模型ではなく「家」に見える提案" },
  { icon: Glasses, title: "360° パノラマ内見", body: "equirectangular 画像を出力。このページのビューア、Teams、スマホ、VR ゴーグルでそのまま内見できる。", done: true, value: "遠方のお客様にもリモート内見" },
  { icon: Layers3, title: "仕上げバリエーション一括レンダリング", body: "保存した提案プラン（外壁・屋根・床の色と仕上げ材）を 1 ジョブでまとめて描画し、比較表に並べる。", done: true, value: "営業の比較提案を即日化" },
  { icon: Sun, title: "冬至の日影図", body: "東京の緯度で冬至 9/12/15 時の太陽位置を計算し、真上から影を描画。北側隣地への影響説明に。", done: true, value: "日影規制の一次確認" },
  { icon: Box, title: "GLB / .blend の引き渡し", body: "GLB は Code App の内見へ（材質名が一致するのでアプリ側の質感で表示）、.blend は設計チームの作り込みの元データへ。座標系は spec と一致。", done: true, value: "簡易モデル → 詳細モデルの連続性" },
  { icon: ScanLine, title: "数量拾い（概算）", body: "延床・外壁・屋根面積、開口数、部屋面積を quantities.json に出力。", done: true, value: "概算見積の初速アップ" },
  { icon: Clapperboard, title: "ウォークスルー動画・ターンテーブル", body: "玄関 → LDK → 2F のカメラパスをアニメーション化して MP4 を出力。SNS・物件ページ用。", done: false, value: "SUUMO 掲載・SNS 集客素材" },
  { icon: Sofa, title: "家具・車の自動ステージング", body: "部屋の名前と広さから家具を選び、壁付け・通路確保・窓前回避のルールで自動配置。駐車場には車。アプリで手直しした配置をそのまま Blender でレンダリング。", done: true, value: "空間の広さと暮らしが伝わる提案" },
  { icon: Sparkles, title: "生成 AI スタイル変換", body: "Blender の深度・法線パスを ControlNet 等に渡し、形状を保ったままテイスト違いの外観イメージを生成。", done: false, value: "初回面談でのイメージ合わせ" },
  { icon: Workflow, title: "Blender MCP × Copilot Studio", body: "Blender を MCP サーバー化し、「外壁をレンガに」「窓を大きく」など自然言語でモデルを編集。", done: false, value: "設計者でなくても修正できる" },
  { icon: Layers3, title: "IFC / BIM 連携（Bonsai）", body: "BuildingSpec から IFC を書き出し、Revit / ArchiCAD / 確認申請フローへ接続。", done: false, value: "提案から実施設計への手戻り削減" },
  { icon: Glasses, title: "USDZ / AR 現地確認", body: "USDZ を出力し、iPhone の AR Quick Look で建設予定地に原寸の建物を置いて見せる。", done: false, value: "土地の上で完成イメージを共有" },
  { icon: Printer, title: "3D プリント模型（STL）", body: "縮尺 1/100 の模型用 STL を出力（階ごとに分割・屋根取り外し）。", done: false, value: "契約前のクロージング材料" },
  { icon: Lightbulb, title: "夜景・照明シミュレーション", body: "時刻と照明器具を切り替えて夜景や室内照明の雰囲気を検討。", done: false, value: "照明計画のオプション提案" },
]

export default function BlenderPage() {
  const q = sampleQuantities

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Blender 連携</h1>
        <p className="text-muted-foreground">
          ブラウザの 3D 内見と同じ BuildingSpec を Blender に渡し、フォトリアル画像・360° パノラマ・日影図・詳細モデルを生成します。
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">パイプライン</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {PIPELINE.map((p, i) => (
              <div key={p.title} className="relative min-w-0 rounded-md border p-3">
                <p className="flex items-center gap-2 text-sm font-medium"><p.icon className="h-4 w-4 shrink-0 text-primary" />{p.title}</p>
                <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.body}</p>
                {i < PIPELINE.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground xl:block" />}
              </div>
            ))}
          </div>
          <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3 text-xs">blender -b --factory-startup -P blender/build_from_spec.py -- --spec blender-job.json --out blender/out/job --variants --sun-study</pre>
        </CardContent>
      </Card>

      <Card data-tour="blender-gallery">
        <CardHeader>
          <CardTitle className="text-base">サンプル出力（サンプル邸 2 階建て・実際に Blender 4.5 LTS で生成）</CardTitle>
          <CardDescription>サンプル間取り図 → 自動解析 → Blender で生成した実ファイルです。</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="panorama">
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="panorama">360° パノラマ</TabsTrigger>
              <TabsTrigger value="renders">外観・内観</TabsTrigger>
              <TabsTrigger value="variants">カラーバリエーション</TabsTrigger>
              <TabsTrigger value="sun">冬至の日影</TabsTrigger>
              <TabsTrigger value="quantities">数量</TabsTrigger>
            </TabsList>
            <TabsContent value="panorama">
              <PanoramaViewer src={`${BASE}panorama.jpg`} className="h-[420px] w-full cursor-grab overflow-hidden rounded-md bg-slate-900" />
              <p className="mt-2 text-xs text-muted-foreground">ドラッグで見回し、ホイールでズーム。LDK の中央から撮影した 360° 画像です。</p>
            </TabsContent>
            <TabsContent value="renders" className="grid gap-3 md:grid-cols-2">
              <Figure src={`${BASE}exterior.jpg`} caption="外観パース（Cycles）" />
              <Figure src={`${BASE}interior.jpg`} caption="内観パース（LDK）" />
            </TabsContent>
            <TabsContent value="variants" className="grid gap-3 md:grid-cols-3">
              {MATERIAL_PRESETS.map(p => <Figure key={p.id} src={`${BASE}variant-${p.id}.jpg`} caption={`${p.name}: ${p.description}`} />)}
            </TabsContent>
            <TabsContent value="sun" className="grid gap-3 md:grid-cols-3">
              {["0900", "1200", "1500"].map(h => <Figure key={h} src={`${BASE}sun-winter-${h}.jpg`} caption={`冬至 ${h.slice(0, 2)}:00（上が北）`} />)}
            </TabsContent>
            <TabsContent value="quantities">
              {q ? (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    {[["延床面積", `${q.floorArea}㎡（${q.floorAreaTsubo}坪）`], ["外壁面積", `${q.exteriorWallArea}㎡`], ["屋根面積", `${q.roofArea}㎡`], ["開口数", `${q.windowCount}`]].map(([k, v]) => (
                      <div key={k} className="min-w-0 rounded-md border p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-semibold">{v}</p></div>
                    ))}
                  </div>
                  <div className="min-w-0 rounded-md border p-3 text-sm">
                    {q.rooms.map(r => <p key={`${r.floor}-${r.name}`} className="flex justify-between border-b py-1 last:border-0"><span>{r.floor}F {r.name}</span><span className="tabular-nums">{r.area}㎡</span></p>)}
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">quantities.json を読み込めませんでした。</p>}
            </TabsContent>
          </Tabs>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a href={`${BASE}sample-model.glb`} download="sample-model.glb" className="rounded-md border px-3 py-1.5 hover:bg-accent">サンプル model.glb をダウンロード（3D 内見タブの「Blender GLB を表示」で読み込めます）</a>
            <a href="./samples/sample-spec.json" download="sample-spec.json" className="rounded-md border px-3 py-1.5 hover:bg-accent">入力に使った BuildingSpec JSON</a>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Blender でできること</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {CAPABILITIES.map(c => (
            <Card key={c.title} className="min-w-0">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm"><c.icon className="h-4 w-4 shrink-0 text-primary" />{c.title}</CardTitle>
                  {c.done ? (
                    <Badge className="shrink-0 gap-1 bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" />実装済み</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">次の提案</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <p className="text-muted-foreground">{c.body}</p>
                <p className="font-medium text-primary">→ {c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function Figure({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="min-w-0">
      <img src={src} alt={caption} className="w-full rounded-md border bg-muted" loading="lazy" />
      <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}
