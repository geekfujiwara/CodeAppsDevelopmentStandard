import { useState } from "react"
import { Copy, Download, Terminal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { downloadJson } from "@/lib/project-utils"
import { MATERIAL_PRESETS, DEFAULT_MATERIALS } from "@/lib/building-spec"
import type { Project } from "@/types/project"
import { CATALOG } from "@/lib/furniture"

export type BlenderJob = {
  jobVersion: 1
  projectId: string
  projectName: string
  spec: NonNullable<Project["spec"]>
  variants: { id: string; name: string; materials: Project["variants"][number]["materials"] }[]
  renders: ("exterior" | "interior" | "panorama")[]
  sunStudy: boolean
  /** 室内の間接光を GLB に焼き込む画像サイズ（0 = 焼かない）。内見の明るさの分布が実物に近づく */
  lightmap: number
  samples: number
  resolution: string
  /** 家具・車の形状定義（Blender 側にリポジトリが無くても再現できるよう同梱） */
  furnitureCatalog: typeof CATALOG
}

const RENDER_OPTIONS = [
  { value: "exterior", label: "外観パース（フォトリアル）" },
  { value: "interior", label: "内観パース（最大の部屋）" },
  { value: "panorama", label: "360° パノラマ（VR 内見用）" },
] as const

export function BlenderJobPanel({ project }: { project: Project }) {
  const [renders, setRenders] = useState<BlenderJob["renders"]>(["exterior", "interior", "panorama"])
  const [variantSource, setVariantSource] = useState<"saved" | "presets" | "none">(project.variants.length ? "saved" : "presets")
  const [sunStudy, setSunStudy] = useState(true)
  const [lightmap, setLightmap] = useState(true)
  const [samples, setSamples] = useState(64)
  const [resolution, setResolution] = useState("1920x1080")

  if (!project.spec) {
    return <p className="text-sm text-muted-foreground">先に「画像から 3D 化」で 3D モデルを生成してください。</p>
  }

  const variants =
    variantSource === "saved"
      ? project.variants.map(v => ({ id: v.id.slice(0, 8), name: v.name, materials: v.materials }))
      : variantSource === "presets"
        ? MATERIAL_PRESETS.map(p => ({ id: p.id, name: p.name, materials: { ...DEFAULT_MATERIALS, ...p.materials } }))
        : []

  const job: BlenderJob = {
    jobVersion: 1,
    projectId: project.id,
    projectName: project.name,
    spec: project.spec,
    variants,
    renders,
    sunStudy,
    lightmap: lightmap ? 1024 : 0,
    samples,
    resolution,
    furnitureCatalog: CATALOG,
  }
  const fileName = `blender-job-${project.id.slice(0, 8)}.json`
  const command = `blender -b --factory-startup -P blender/build_from_spec.py -- --spec ${fileName} --out blender/out/${project.id.slice(0, 8)} --samples ${samples} --res ${resolution}`

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blender ジョブを作成</CardTitle>
          <CardDescription>
            この案件の BuildingSpec と提案プランを Blender 用ジョブ JSON に書き出します。Blender ワーカーが GLB・フォトリアル画像・360° パノラマ・日影図を生成します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">レンダリング</Label>
            {RENDER_OPTIONS.map(o => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={renders.includes(o.value)}
                  onChange={e => setRenders(e.target.checked ? [...renders, o.value] : renders.filter(r => r !== o.value))}
                />
                {o.label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sunStudy} onChange={e => setSunStudy(e.target.checked)} />
              冬至の日影図（9 時 / 12 時 / 15 時、東京の緯度）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lightmap} onChange={e => setLightmap(e.target.checked)} />
              室内の照り返し（間接光）を GLB に焼き込む（GPU で 3 分ほど）
            </label>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">カラーバリエーションの一括レンダリング</Label>
            <div className="flex flex-wrap gap-3 text-sm">
              {([["saved", `保存済みプラン（${project.variants.length}）`], ["presets", `標準プリセット（${MATERIAL_PRESETS.length}）`], ["none", "しない"]] as const).map(([v, label]) => (
                <label key={v} className="flex items-center gap-1">
                  <input type="radio" name="variant-source" checked={variantSource === v} onChange={() => setVariantSource(v)} disabled={v === "saved" && !project.variants.length} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">サンプル数（品質）</Label>
              <Input type="number" min={8} max={1024} value={samples} onChange={e => setSamples(Number(e.target.value) || 64)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">解像度</Label>
              <Input value={resolution} onChange={e => setResolution(e.target.value)} pattern="\d+x\d+" />
            </div>
          </div>
          <Button className="w-full gap-2" onClick={() => downloadJson(fileName, job)} data-tour="blender-job">
            <Download className="h-4 w-4" />ジョブ JSON をダウンロード
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Terminal className="h-4 w-4" />Blender ワーカーで実行</CardTitle>
          <CardDescription>設計チームの PC、または GPU 付きのレンダリングサーバーで実行します（Blender 4.2 LTS 以降）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="relative">
            <pre className="overflow-x-auto rounded-md bg-muted p-3 pr-10 text-xs">{command}</pre>
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1 h-7 w-7"
              aria-label="コマンドをコピー"
              onClick={() => (navigator.clipboard?.writeText(command) ?? Promise.reject(new Error("clipboard"))).then(() => toast.success("コピーしました"), () => toast("コマンド（選択してコピーしてください）", { description: command, duration: 20000 }))}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li><code>model.glb</code> を「3D 内見・提案」タブの「Blender GLB を表示」で読み込むと、Blender で詳細化したモデルで内見できます。間接光を焼き込んだ GLB は、部屋の奥・天井の明るさの分布まで再現します。</li>
            <li>背景と映り込みに実写の空（HDRI）を使う場合は <code>--hdri &lt;.hdr&gt;</code> を付けます（拡散光は時刻どおりの太陽と空のまま）。</li>
            <li><code>renders/*.png</code> は提案書・SUUMO 掲載用のフォトリアル画像として使えます。</li>
            <li><code>renders/panorama.png</code> は 360° ビューア（Teams / スマホ / VR ゴーグル）でそのまま内見できます。</li>
            <li><code>quantities.json</code> の延床・外壁・屋根面積は概算見積の入力に使えます。</li>
            <li><code>model.blend</code> は設計チームが家具配置・素材・照明を作り込む元データです。</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
