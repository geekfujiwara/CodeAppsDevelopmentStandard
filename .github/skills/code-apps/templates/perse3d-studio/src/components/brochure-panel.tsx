import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Project } from "@/types/project"
import { brochureDraft, brochureErrors, brochureFactErrors, brochureFacts, brochureFileName, brochureInput, type BrochureDraft, type BrochureImage } from "@/lib/brochure"
import { fileToDataUrl, loadImage } from "@/lib/perspective-analyzer"
import { nextFrame } from "@/lib/generation-progress"

async function localPdfImage(src: string, label: string): Promise<BrochureImage> {
  const url = new URL(src, location.href)
  if (!src.startsWith("data:") && url.origin !== location.origin) throw new Error(`「${label}」は外部画像です。先に画像をアップロードしてください`)
  const img = await loadImage(src)
  const k = Math.min(1, 1800 / Math.max(img.width, img.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(img.width * k)); canvas.height = Math.max(1, Math.round(img.height * k))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("PDF画像用の描画領域を作成できませんでした")
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { label, dataUrl: canvas.toDataURL("image/jpeg", 0.92) }
}

export function BrochurePanel({ project, modelImage }: { project: Project; modelImage?: string | null }) {
  const [draft, setDraft] = useState(() => brochureDraft(project))
  const [facts, setFacts] = useState(() => brochureFacts(project))
  const [heroKind, setHeroKind] = useState<"source" | "model" | "upload" | "none">(modelImage ? "model" : project.images.perspective ? "source" : "none")
  const [upload, setUpload] = useState<string | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errors = [...brochureErrors(draft), ...brochureFactErrors(facts)]
  const field = (key: keyof BrochureDraft, value: string | boolean) => setDraft(d => ({ ...d, [key]: value }))
  const heroSrc = heroKind === "model" ? modelImage : heroKind === "source" ? project.images.perspective : heroKind === "upload" ? upload : null
  const heroLabel = heroKind === "model" ? "参考3Dイメージ（間取り図等から再構成）" : "外観画像（掲載権限確認済み）"
  const exportPdf = async () => {
    setError(null)
    try {
      setStep("画像・間取り図を準備しています")
      await nextFrame()
      const hero = heroSrc ? await localPdfImage(heroSrc, heroLabel) : undefined
      const input = brochureInput(project, draft, hero, facts)
      for (const [i, plan] of input.floorplans.entries()) {
        await nextFrame()
        input.floorplans[i] = await localPdfImage(plan.dataUrl, plan.label)
      }
      setStep("日本語PDFを生成しています")
      await nextFrame()
      const [{ createBrochurePdf, dataUrlBytes }, fontModule] = await Promise.all([
        import("@/lib/brochure-pdf"), import("@/assets/fonts/NotoSansJP-Regular.ttf?inline"),
      ])
      const bytes = await createBrochurePdf(input, dataUrlBytes(fontModule.default))
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = brochureFileName(draft.title)
      document.body.appendChild(a); a.click(); a.remove()
      // 大きなPDFをdata URLにせず、ダウンロード開始後に一時URLを解放する。
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      toast.success("販売用パンフレットPDFを作成しました。ダウンロードした内容を確認してください")
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      toast.error(`PDFを作成できませんでした: ${message}`)
    } finally { setStep(null) }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" data-testid="brochure-panel">
      <Card className="min-w-0">
        <CardHeader><CardTitle>販売用パンフレット</CardTitle><CardDescription>A4 PDFに物件概要・外観・各階の間取り図・会社情報を出力します。入力はこの画面の下書きで、案件情報は変更しません。</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["title", "物件名 *"], ["price", "販売価格（表示文）*"], ["address", "所在地 *"], ["headline", "見出し"],
              ["company", "会社名 *"], ["companyAddress", "会社所在地 *"], ["phone", "電話・問い合わせ先 *"],
              ["license", "宅地建物取引業の免許番号 *"], ["transaction", "取引態様（売主・媒介など）*"],
              ["issuedOn", "発行日 *"], ["validUntil", "情報有効期限 *"],
            ] as const).map(([key, label]) => (
              <div className="min-w-0 space-y-1" key={key}>
                <Label htmlFor={`brochure-${key}`}>{label}</Label>
                <Input id={`brochure-${key}`} type={key === "issuedOn" || key === "validUntil" ? "date" : "text"}
                  value={draft[key]} disabled={!!step} onChange={e => field(key, e.target.value)} />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="brochure-description">紹介文（1400文字まで）</Label>
            <Textarea id="brochure-description" rows={4} maxLength={1400} value={draft.description} disabled={!!step} onChange={e => field("description", e.target.value)} />
          </div>
          <div className="space-y-2 rounded border p-3">
            <h3 className="text-sm font-semibold">パンフレット用の物件概要（確認・修正）</h3>
            <p className="text-xs text-muted-foreground">空欄・要確認のまま出力できません。対象外の項目も理由を明記してください。ここでの修正は案件や3D寸法には反映しません。</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {facts.map((f, i) => <div key={`${i}:${f.label}`} className="min-w-0 space-y-1">
                <Label htmlFor={`brochure-fact-${i}`}>{f.label}</Label>
                <Input id={`brochure-fact-${i}`} value={f.value} disabled={!!step} maxLength={1000}
                  onChange={e => setFacts(prev => prev.map((v, k) => k === i ? { ...v, value: e.target.value } : v))} />
              </div>)}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.rightsConfirmed} disabled={!!step} onChange={e => field("rightsConfirmed", e.target.checked)} data-testid="brochure-rights" />
            掲載画像・図面・物件情報の利用権限を確認しました（他サイトで公開されているだけでは転載許可になりません）。
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.factsConfirmed} disabled={!!step} onChange={e => field("factsConfirmed", e.target.checked)} data-testid="brochure-facts" />
            所在地・価格・現況・取引条件・広告上の必須表示を確認しました。参考3Dを実物写真と誤認させないことを確認します。
          </label>
          {errors.length > 0 && <ul className="max-h-40 overflow-auto text-xs text-muted-foreground">{errors.map(e => <li key={e}>・{e}</li>)}</ul>}
          {error && <p className="whitespace-pre-wrap text-sm text-destructive" role="alert">{error}</p>}
          {step && <p className="text-sm text-muted-foreground" role="status">{step}…</p>}
          <Button className="gap-2" disabled={!!step || errors.length > 0} onClick={exportPdf} data-testid="brochure-export">
            {step ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}販売用PDFをダウンロード
          </Button>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader><CardTitle className="text-base">掲載画像と出力内容</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="brochure-hero">表紙の画像</Label>
            <select id="brochure-hero" className="w-full rounded border bg-background p-2 text-sm" value={heroKind} disabled={!!step} onChange={e => setHeroKind(e.target.value as typeof heroKind)}>
              <option value="none">画像なし</option>
              {project.images.perspective && <option value="source">案件の外観画像</option>}
              {modelImage && <option value="model">3D内見で選んだ視点（参考3D）</option>}
              {upload && <option value="upload">アップロードした外観画像</option>}
            </select>
          </div>
          <label className="inline-flex cursor-pointer rounded border px-3 py-2 text-sm hover:bg-accent">
            権利のある外観画像を選ぶ
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!!step} onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              try { setUpload(await fileToDataUrl(file, 1800, 0.92)); setHeroKind("upload") }
              catch (error) { toast.error(`画像を読めませんでした: ${error instanceof Error ? error.message : String(error)}`) }
            }} />
          </label>
          {heroSrc && <figure><img src={heroSrc} alt={heroLabel} className="max-h-64 w-full rounded border bg-muted object-contain" /><figcaption className="mt-1 text-xs text-muted-foreground">{heroLabel}</figcaption></figure>}
          <div className="rounded border bg-muted/30 p-3 text-sm">
            <p>表紙：物件名・販売価格・所在地・外観・紹介文</p>
            <p>物件概要：面積・構造・交通・道路・用途地域・取引条件・取り込み元</p>
            <p>間取り：各階の受領画像を掲載（1ページに最大2階分）</p>
            <p>各ページ：会社名・問い合わせ先・免許番号・発行日・情報有効期限</p>
          </div>
          <p className="text-xs text-amber-700">未登録の物件項目は確認・入力が必要です。PDFの日本語はフォント埋め込みで出力し、外部サービスへ情報を送信しません。販売前の広告審査・最終確認は不動産業者が行ってください。</p>
          <p className="text-xs text-muted-foreground">3D画像を使う場合：「3D内見・提案」で視点を決め、「この視点で販売用PDF」を押してください。</p>
        </CardContent>
      </Card>
    </div>
  )
}
