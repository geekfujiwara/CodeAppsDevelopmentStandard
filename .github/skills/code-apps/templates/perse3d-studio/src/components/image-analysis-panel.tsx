import { useEffect, useMemo, useRef, useState } from "react"
import { FileJson, ImagePlus, Layers, Palette, Plus, Sparkles, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DEFAULT_MASSING,
  ROOF_LABELS,
  generateFromMassing,
  parseBuildingSpec,
  type BuildingSpec,
  type ColorKey,
  type MassingParams,
  type RoofType,
} from "@/lib/building-spec"
import {
  DEFAULT_FLOORPLAN_OPTIONS,
  KIND_COLORS,
  analyzeFloorplan,
  chooseScale,
  drawFloorplanOverlay,
  scaleCandidates,
  specFromFloorplans,
  structureScore,
  type FloorplanOptions,
  type FloorplanResult,
} from "@/lib/floorplan-analyzer"
import { analyzePerspective, fileToDataUrl, imageDataFromUrl, loadImage } from "@/lib/perspective-analyzer"
import type { SourceImages } from "@/types/project"
import { downloadJson } from "@/lib/project-utils"
import { generationProgress, nextFrame } from "@/lib/generation-progress"
import { bedroomsOf, fitFloorWidths, type ListingInfo } from "@/lib/listing"
import { splitFloorplanSheet } from "@/lib/floorplan-import"
import { FinishSelects } from "@/components/finish-selects"

type Props = {
  projectName: string
  images: SourceImages
  spec: BuildingSpec | null
  onImagesChange: (images: SourceImages) => void
  onGenerate: (spec: BuildingSpec) => void | Promise<void>
  saving?: boolean
  /** 取り込んだ物件情報（延床面積で縮尺を合わせる） */
  listing?: ListingInfo | null
}

const MATERIAL_LABELS: Record<ColorKey, string> = {
  exteriorWall: "外壁",
  roof: "屋根",
  floor: "床",
  interiorWall: "内壁",
  trim: "サッシ・見切り",
  ground: "地面",
}

export function ImageAnalysisPanel({ projectName, images, spec, onImagesChange, onGenerate, saving, listing }: Props) {
  const [massing, setMassing] = useState<MassingParams>(() => ({
    ...DEFAULT_MASSING,
    name: projectName,
    ...(spec ? { roof: spec.roof.type, pitch: spec.roof.pitch, floors: spec.floors.length, width: spec.footprint.width, depth: spec.footprint.depth, materials: spec.materials } : {}),
  }))
  const [palette, setPalette] = useState<string[]>([])
  const [fpOptions, setFpOptions] = useState<Record<string, FloorplanOptions>>({})
  const [results, setResults] = useState<Record<string, FloorplanResult | string>>({})
  const [jsonText, setJsonText] = useState("")
  const floorKeys = useMemo(() => Object.keys(images.floorplans).sort(), [images.floorplans])

  const optionsFor = (key: string): FloorplanOptions => fpOptions[key] ?? { ...DEFAULT_FLOORPLAN_OPTIONS, level: Number(key), widthMeters: massing.width, floorHeight: massing.floorHeight }

  const upload = async (file: File | undefined, target: "perspective" | string) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイル（PNG / JPEG）を選択してください")
      return
    }
    const url = await fileToDataUrl(file, target === "perspective" ? 1200 : 1400)
    if (target === "perspective") {
      onImagesChange({ ...images, perspective: url })
      return
    }
    // 1F・2F を並べた 1 枚の間取り図（不動産サイトの図面）は、階ごとに切り出して続きの階にする
    const pieces = await splitFloorplanSheet(url, listing?.floors)
    if (pieces) {
      const start = Number(target)
      const floorplans = { ...images.floorplans }
      pieces.forEach((p, i) => (floorplans[String(start + i)] = p))
      onImagesChange({ ...images, floorplans, floorplanSheet: true })
      toast.success(`1 枚の間取り図を ${pieces.length} 階分（${pieces.map((_, i) => `${start + i + 1}F`).join("・")}）に分けました。横に並べた図面は左から、縦に積んだ図面は下から 1F としています`)
      return
    }
    onImagesChange({ ...images, floorplans: { ...images.floorplans, [target]: url }, floorplanSheet: false })
    // 物件は複数階なのに 1 枚の図面から階を分けられなかった（敷地図に重ねた図面・二世帯の図面など）
    if (listing?.floors && listing.floors >= 2 && Object.keys(images.floorplans).length === 0) {
      toast.warning(`物件は ${listing.floors} 階建てですが、この図面から階ごとの図面を見つけられませんでした。階ごとに切り抜いた画像を 1 枚ずつ追加してください`)
    }
  }

  // 外観パースの色抽出
  useEffect(() => {
    if (!images.perspective) return
    let cancelled = false
    imageDataFromUrl(images.perspective, 600)
      .then(data => {
        if (cancelled) return
        const a = analyzePerspective(data)
        setPalette(a.palette)
        setMassing(m => ({ ...m, materials: { ...m.materials, ...a.materials } }))
      })
      .catch(e => toast.error(e.message))
    return () => {
      cancelled = true
    }
  }, [images.perspective])

  // どの画像・設定で解析した結果かを覚えておき、生成時に古い結果を使わない
  const analyzedWith = useRef<Record<string, string>>({})
  const analysisKey = (src: string, opts: FloorplanOptions) => `${src.length}:${src.slice(-64)}:${JSON.stringify(opts)}`

  // 最後に依頼した解析。後から終わった古い解析で結果を上書きしない
  const requested = useRef<Record<string, string>>({})
  const analyzeOne = async (key: string, opts: FloorplanOptions) => {
    const src = images.floorplans[key]
    if (!src) return
    const want = analysisKey(src, opts)
    requested.current[key] = want
    try {
      const data = await imageDataFromUrl(src, 1000)
      const r = analyzeFloorplan(data, opts)
      if (requested.current[key] !== want) return
      // 表示中の結果がどの設定のものかを記録する（縮尺の自動合わせと生成時の再利用の判定に使う）
      analyzedWith.current[key] = want
      setResults(prev => ({ ...prev, [key]: r }))
    } catch (e) {
      setResults(prev => ({ ...prev, [key]: e instanceof Error ? e.message : String(e) }))
    }
  }

  useEffect(() => {
    const timers = floorKeys.map(k => window.setTimeout(() => analyzeOne(k, optionsFor(k)), 150))
    return () => timers.forEach(t => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorKeys.join("|"), JSON.stringify(fpOptions), images.floorplans])

  // 物件情報の延床面積と、図面から測った床面積（全階の合計）を比べて縮尺を合わせる
  const analyzed = floorKeys.map(k => results[k]).filter((r): r is FloorplanResult => typeof r === "object")
  const areaFit = (() => {
    if (!listing?.buildingArea || analyzed.length !== floorKeys.length || !analyzed.length) return null
    const widths = floorKeys.map(key => optionsFor(key).widthMeters)
    // 1 枚の画像から切り出した階は画素幅の比を保つ（縮尺が共通）。別々の画像は全階で共通の横幅
    const target = fitFloorWidths(widths, analyzed.map(r => r.floorArea), listing.buildingArea, listing.floors, images.floorplanSheet ? analyzed.map(r => r.bboxPx.w) : undefined)
    if (!target) return null
    const measured = analyzed.reduce((a, r) => a + r.floorArea, 0)
    // 候補（±2%）から選んだ横幅なら合っているとみなす（全階が同じ倍率でずれているとき）
    const ratio = widths.map((w, i) => w / target[i])
    return { measured, widths: target, width: target[0], ok: ratio.every(q => Math.abs(q - 1) <= 0.021 && Math.abs(q - ratio[0]) < 0.005) }
  })()
  const [fitting, setFitting] = useState(false)
  // 延床面積から決めた横幅の ±2% を試し、間仕切り・設備・階段が最もよく取れる横幅にする（全階で同じ横幅）
  const applyAreaFit = async (auto = false) => {
    if (!areaFit || fitting) return
    setFitting(true)
    try {
      const imgs = await Promise.all(floorKeys.map(k => imageDataFromUrl(images.floorplans[k], 1000)))
      const scored: { width: number; score: number }[] = []
      // 全階の横幅に同じ倍率をかけて試す（1F の横幅で代表させる）
      const at = (w0: number) => areaFit.widths.map(w => Math.round(((w * w0) / areaFit.width) * 100) / 100)
      for (const width of scaleCandidates(areaFit.width)) {
        await nextFrame()
        const ws = at(width)
        const rs = imgs.map((img, i) => analyzeFloorplan(img, { ...optionsFor(floorKeys[i]), widthMeters: ws[i] }))
        scored.push({ width, score: structureScore(rs, { bedrooms: bedroomsOf(listing?.layout) }) })
      }
      const ws = at(chooseScale(Math.round(areaFit.width * 100) / 100, scored))
      setFpOptions(Object.fromEntries(floorKeys.map((key, i) => [key, { ...optionsFor(key), widthMeters: ws[i] }])))
      toast.success(`${auto ? "物件情報の" : ""}建物面積（${listing!.buildingArea} m²）に合わせて、図面の横幅を ${[...new Set(ws.map(w => w.toFixed(2)))].join(" / ")} m にしました`)
    } catch (e) {
      toast.error(`縮尺を合わせられませんでした: ${e instanceof Error ? e.message : e}`)
    } finally {
      setFitting(false)
    }
  }
  // 物件情報があれば、物件の階数ぶんの図面がそろって解析できた時点で 1 回だけ自動で合わせる
  // （1 階だけ取り込んだ時点で合わせると、後から足した階が既定の横幅のまま残る。その後に横幅を手で変えたら、それを優先する）
  // 階の入れ替え・差し替えで図面が変わったら合わせ直す（階のキーだけだと、入れ替え前の並びで回数を使い切る）
  const fitKey = `${listing?.buildingArea}:${floorKeys.map(k => `${k}=${images.floorplans[k]?.length}:${images.floorplans[k]?.slice(-24)}`).join(",")}`
  // 縮尺で外形の取れ方が変わり、面積が横幅の 2 乗に比例しないことがあるので、合わせた後にもう 1 回だけ合わせ直す
  const autoFitted = useRef<{ key: string; count: number } | null>(null)
  // 解析結果が今の設定（横幅）のものか。合わせた直後は前の横幅の結果が残っているので、それで合わせ直さない
  const fresh = floorKeys.every(k => images.floorplans[k] && analyzedWith.current[k] === analysisKey(images.floorplans[k], optionsFor(k)))
  useEffect(() => {
    if (!areaFit || fitting || !fresh || floorKeys.length < (listing?.floors ?? 1)) return
    const count = autoFitted.current?.key === fitKey ? autoFitted.current.count : 0
    if (count >= 2) return
    autoFitted.current = { key: fitKey, count: count + 1 }
    if (!areaFit.ok) void applyAreaFit(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaFit?.width, areaFit?.ok, fitKey, fitting, fresh])

  const [busy, setBusy] = useState(false)
  const generate = async () => {
    if (busy) return
    setBusy(true)
    const fromPlans = floorKeys.length > 0
    const labels = fromPlans
      ? ["間取り図を解析", "壁・部屋・階段・設備を組み立て", "案件に保存", "3D モデルを構築"]
      : ["パース・外形から建物を組み立て", "案件に保存", "3D モデルを構築"]
    generationProgress.start(spec ? "3D モデルを再生成しています" : "3D モデルを生成しています", labels)
    let step = 0
    try {
      await nextFrame()
      let next: BuildingSpec
      if (fromPlans) {
        // 設定変更の直後は解析が未完了のことがあるので、表示中の結果ではなく最新の設定で解析し直す
        const fresh = await Promise.all(
          floorKeys.map(async k => {
            const src = images.floorplans[k]
            if (!src) return null
            const opts = optionsFor(k)
            const r = results[k]
            if (typeof r === "object" && analyzedWith.current[k] === analysisKey(src, opts)) return r
            const data = await imageDataFromUrl(src, 1000)
            await nextFrame()
            const a = analyzeFloorplan(data, opts)
            analyzedWith.current[k] = analysisKey(src, opts)
            setResults(prev => ({ ...prev, [k]: a }))
            return a
          }),
        )
        const ok = fresh.filter((r): r is FloorplanResult => !!r)
        if (!ok.length) throw new Error("間取り図を解析できませんでした")
        generationProgress.done(step++, `${ok.length} フロア・部屋 ${ok.reduce((n, r) => n + (r.floor.rooms?.length ?? 0), 0)} 室`)
        await nextFrame()
        next = specFromFloorplans(ok, { name: massing.name, roof: massing.roof, pitch: massing.pitch, materials: massing.materials, withPerspective: !!images.perspective })
        const stairs = next.stairs?.length ?? 0
        const fixtures = (next.furniture ?? []).filter(f => f.fixed).length
        generationProgress.done(step++, `壁 ${next.floors.reduce((n, f) => n + f.walls.length, 0)} 枚・階段 ${stairs} 箇所・設備 ${fixtures} 点`)
      } else {
        next = generateFromMassing(massing)
        next.source = images.perspective ? "perspective" : "manual"
        generationProgress.done(step++)
      }
      await nextFrame()
      await onGenerate(next)
      generationProgress.done(step++)
      // 最後の段は 3D ビューアが構築を終えたときに完了になる
      generationProgress.waitViewer()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      generationProgress.fail(step, message)
      toast.error(`3D モデルを生成できませんでした: ${message}`)
    } finally {
      setBusy(false)
    }
  }

  const importJson = (text: string) => {
    try {
      const raw = JSON.parse(text)
      const parsed = parseBuildingSpec(raw.spec ?? raw)
      onGenerate(parsed)
      toast.success("BuildingSpec JSON を取り込みました")
      setJsonText("")
    } catch (e) {
      toast.error(`JSON を取り込めませんでした: ${e instanceof Error ? e.message : e}`)
    }
  }

  // 階の入れ替え（1 枚の画像を切り出したときの並びが違う図面: 田の字に並べた図面・上下の向き）。画像・解析結果・横幅を入れ替える
  const swapFloors = (a: string, b: string) => {
    onImagesChange({ ...images, floorplans: { ...images.floorplans, [a]: images.floorplans[b], [b]: images.floorplans[a] } })
    setResults(prev => ({ ...prev, [a]: prev[b], [b]: prev[a] }))
    setFpOptions(prev => {
      const n = { ...prev }
      const oa = prev[a], ob = prev[b]
      if (ob) n[a] = { ...ob, level: Number(a) }
      else delete n[a]
      if (oa) n[b] = { ...oa, level: Number(b) }
      else delete n[b]
      return n
    })
  }

  const nextFloorKey = String(floorKeys.length ? Math.max(...floorKeys.map(Number)) + 1 : 0)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        {/* 外観パース */}
        <Card data-tour="upload-perspective">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ImagePlus className="h-4 w-4" />外観パース（SUUMO 掲載画像・CG・写真）</CardTitle>
            <CardDescription>外壁・屋根・地面の色を自動抽出します。寸法・階数・屋根形状は右のパネルで調整します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {images.perspective ? (
              <div className="relative">
                <img src={images.perspective} alt="外観パース" className="max-h-72 w-full rounded-md object-contain bg-muted" />
                <Button size="icon" variant="secondary" className="absolute right-2 top-2 h-8 w-8" onClick={() => onImagesChange({ ...images, perspective: undefined })} aria-label="パースを削除">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <DropZone label="外観パース画像をドロップ、またはクリックして選択" onFile={f => upload(f, "perspective")} />
            )}
            {palette.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Palette className="h-4 w-4" />抽出パレット
                {palette.map(c => (
                  <span key={c} className="h-5 w-5 rounded border" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 間取り図 */}
        <Card data-tour="upload-floorplan">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4" />間取り図（階ごと）</CardTitle>
            <CardDescription>
              壁（赤）・窓（青）・掃き出し窓（緑）・ドア（橙）・部屋を自動検出します。図面の横幅（m）を入れると縮尺が決まります。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {areaFit && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" data-testid="area-fit">
                <span className="min-w-0 flex-1">
                  物件情報の建物面積 {listing!.buildingArea} m²{listing!.floors ? `（${listing!.floors} 階建）` : ""}：図面から測った床面積は {areaFit.measured.toFixed(1)} m²
                  {fitting ? "です。縮尺を合わせています…" : areaFit.ok ? "で、縮尺は合っています。" : `です。横幅を ${[...new Set(areaFit.widths.map(w => w.toFixed(2)))].join(" / ")} m 前後にすると一致します。`}
                </span>
                {!areaFit.ok && (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => void applyAreaFit()} disabled={fitting}>建物面積に合わせる</Button>
                )}
              </div>
            )}
            {floorKeys.map(key => (
              <FloorplanEditor
                key={key}
                floorKey={key}
                src={images.floorplans[key]}
                options={optionsFor(key)}
                result={results[key]}
                onOptions={o => setFpOptions(prev => ({ ...prev, [key]: o }))}
                onReplace={f => upload(f, key)}
                onMoveUp={floorKeys.indexOf(key) < floorKeys.length - 1 ? () => swapFloors(key, floorKeys[floorKeys.indexOf(key) + 1]) : undefined}
                onRemove={() => {
                  const fp = { ...images.floorplans }
                  delete fp[key]
                  onImagesChange({ ...images, floorplans: fp })
                  setResults(prev => {
                    const n = { ...prev }
                    delete n[key]
                    return n
                  })
                }}
              />
            ))}
            <DropZone label={`${Number(nextFloorKey) + 1}F の間取り図を追加`} onFile={f => upload(f, nextFloorKey)} icon={<Plus className="h-5 w-5" />} />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card data-tour="massing">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4" />建物条件</CardTitle>
            <CardDescription>
              {floorKeys.length ? "間取り図から壁・部屋を生成し、屋根と色をここで決めます。" : "間取り図がない場合は、この条件から内見できる標準プランを生成します。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="間口（m）" disabled={floorKeys.length > 0}>
                <Input type="number" step="0.01" min={4} max={30} value={massing.width} disabled={floorKeys.length > 0} onChange={e => setMassing({ ...massing, width: Number(e.target.value) })} />
              </Field>
              <Field label="奥行（m）" disabled={floorKeys.length > 0}>
                <Input type="number" step="0.01" min={4} max={30} value={massing.depth} disabled={floorKeys.length > 0} onChange={e => setMassing({ ...massing, depth: Number(e.target.value) })} />
              </Field>
              <Field label="階数" disabled={floorKeys.length > 0}>
                <Input type="number" min={1} max={4} value={massing.floors} disabled={floorKeys.length > 0} onChange={e => setMassing({ ...massing, floors: Math.max(1, Math.min(4, Number(e.target.value))) })} />
              </Field>
              <Field label="階高（m）">
                <Input type="number" step="0.05" min={2.4} max={4} value={massing.floorHeight} onChange={e => {
                  const h = Number(e.target.value)
                  setMassing({ ...massing, floorHeight: h })
                  setFpOptions(prev => Object.fromEntries(floorKeys.map(k => [k, { ...optionsFor(k), ...prev[k], floorHeight: h }])))
                }} />
              </Field>
              <Field label="屋根形状">
                <Select value={massing.roof} onValueChange={v => setMassing({ ...massing, roof: v as RoofType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROOF_LABELS) as RoofType[]).map(r => <SelectItem key={r} value={r}>{ROOF_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`屋根勾配（${massing.pitch}°）`}>
                <input type="range" min={5} max={45} value={massing.pitch} onChange={e => setMassing({ ...massing, pitch: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
              </Field>
              {floorKeys.length === 0 && (
                <Field label={`窓の多さ（${Math.round(massing.windowDensity * 100)}%）`}>
                  <input type="range" min={0} max={1} step={0.1} value={massing.windowDensity} onChange={e => setMassing({ ...massing, windowDensity: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
                </Field>
              )}
            </div>
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">仕上げ材</Label>
              <FinishSelects materials={massing.materials} onChange={materials => setMassing({ ...massing, materials })} />
            </div>
            <div>
              <Label className="mb-2 block text-xs text-muted-foreground">仕上げ色（パースから自動抽出・変更可）</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(MATERIAL_LABELS) as ColorKey[]).map(k => (
                  <label key={k} className="flex items-center gap-2 rounded-md border p-1.5 text-xs">
                    <input type="color" value={massing.materials[k]} onChange={e => setMassing({ ...massing, materials: { ...massing.materials, [k]: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
                    <span className="min-w-0 truncate">{MATERIAL_LABELS[k]}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full gap-2" size="lg" onClick={generate} disabled={saving || busy || fitting} data-tour="generate">
              <Sparkles className="h-4 w-4" />
              {spec ? "3D モデルを再生成して保存" : "3D モデルを生成して保存"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><FileJson className="h-4 w-4" />BuildingSpec JSON</CardTitle>
            <CardDescription>
              AI 解析（Copilot Studio / Azure OpenAI）や Blender で作った JSON を取り込めます。現在のモデルの書き出しも可能です。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea rows={4} placeholder='{"footprint":{"width":9.1,"depth":7.28},"floors":[...]}' value={jsonText} onChange={e => setJsonText(e.target.value)} className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!jsonText.trim()} onClick={() => importJson(jsonText)}>取り込む</Button>
              <Button variant="outline" size="sm" disabled={!spec} onClick={() => spec && downloadJson(`${spec.name}.building-spec.json`, spec)}>現在のモデルを書き出す</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={disabled ? "space-y-1 opacity-60" : "space-y-1"}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function DropZone({ label, onFile, icon }: { label: string; onFile: (f: File | undefined) => void; icon?: React.ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={e => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        onFile(e.dataTransfer.files[0])
      }}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary ${over ? "border-primary bg-primary/5" : ""}`}
    >
      {icon ?? <ImagePlus className="h-6 w-6" />}
      {label}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => onFile(e.target.files?.[0] ?? undefined)} />
    </button>
  )
}

function FloorplanEditor({
  floorKey,
  src,
  options,
  result,
  onOptions,
  onReplace,
  onRemove,
  onMoveUp,
}: {
  floorKey: string
  src: string
  options: FloorplanOptions
  result: FloorplanResult | string | undefined
  onOptions: (o: FloorplanOptions) => void
  onReplace: (f: File | undefined) => void
  onRemove: () => void
  /** 1 つ上の階と入れ替える（最上階では undefined） */
  onMoveUp?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showOverlay, setShowOverlay] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadImage(src).then(img => {
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      // 解析は長辺 1000px に縮小して行うため、描画も同じ縮尺に合わせる
      const analysisScale = Math.min(1, 1000 / Math.max(img.width, img.height))
      const w = Math.round(img.width * analysisScale)
      const h = Math.round(img.height * analysisScale)
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)
      if (showOverlay && result && typeof result === "object") drawFloorplanOverlay(ctx, result, 1)
    })
    return () => {
      cancelled = true
    }
  }, [src, result, showOverlay])

  const r = typeof result === "object" ? result : null
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{Number(floorKey) + 1}F</Badge>
          {r && (
            <span className="text-xs text-muted-foreground">
              {r.footprint.width}m × {r.footprint.depth}m ／ 部屋 {r.stats.rooms} ／ 窓 {r.stats.windows} ／ ドア {r.stats.doors}
            </span>
          )}
          {r && r.stairHints.length > 0 && <Badge variant="secondary">階段の記号を検出</Badge>}
          {typeof result === "string" && <span className="text-xs text-destructive">{result}</span>}
        </div>
        <div className="flex gap-1">
          {onMoveUp && (
            <Button size="sm" variant="ghost" onClick={onMoveUp} title="この図面と 1 つ上の階の図面を入れ替える">
              {Number(floorKey) + 2}F と入れ替え
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowOverlay(!showOverlay)}>{showOverlay ? "検出結果を隠す" : "検出結果を表示"}</Button>
          <label className="inline-flex cursor-pointer items-center rounded-md px-3 text-sm hover:bg-accent">
            差し替え
            <input type="file" accept="image/*" className="hidden" onChange={e => onReplace(e.target.files?.[0])} />
          </label>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove} aria-label="間取り図を削除"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <canvas ref={canvasRef} className="h-auto w-full rounded bg-white" />
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {Object.entries({ 壁: KIND_COLORS.wall, 窓: KIND_COLORS.window, 掃き出し窓: KIND_COLORS.glassdoor, ドア: KIND_COLORS.door }).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{k}</span>
        ))}
      </div>
      {r?.scaleCheck.suggestedWidth && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span>
            この縮尺だと壁の厚みが {Math.round(r.scaleCheck.wallMeters * 100)}cm になります（住宅は 12〜18cm 程度）。図面の横幅は {r.scaleCheck.suggestedWidth.toFixed(2)}m ではありませんか。
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => onOptions({ ...options, widthMeters: r.scaleCheck.suggestedWidth! })}>
            {r.scaleCheck.suggestedWidth.toFixed(2)}m にする
          </Button>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={options.auto !== false} onChange={e => onOptions({ ...options, auto: e.target.checked })} />
        壁の濃さ・細線の除去を図面から自動で決める（色付きの間取り図・小さい画像にも対応）
        {r && options.auto !== false && <span className="text-muted-foreground">（濃さ {r.applied.threshold}・除去 {r.applied.cleanRadius}・壁の太さ {r.applied.wallPx}px）</span>}
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">図面の横幅（m）</Label>
          <Input type="number" step="0.01" min={3} max={40} value={options.widthMeters} onChange={e => onOptions({ ...options, widthMeters: Number(e.target.value) || options.widthMeters })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">壁と判定する濃さ（{options.auto !== false && r ? r.applied.threshold : options.threshold}）</Label>
          <input type="range" min={40} max={220} value={options.auto !== false && r ? r.applied.threshold : options.threshold} onChange={e => onOptions({ ...options, auto: false, threshold: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">細線・文字の除去（{options.auto !== false && r ? r.applied.cleanRadius : options.cleanRadius}）</Label>
          <input type="range" min={0} max={6} value={options.auto !== false && r ? r.applied.cleanRadius : options.cleanRadius} onChange={e => onOptions({ ...options, auto: false, cleanRadius: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
        </div>
      </div>
    </div>
  )
}
