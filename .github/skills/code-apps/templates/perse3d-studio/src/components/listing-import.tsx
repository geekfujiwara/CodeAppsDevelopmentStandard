import { useState } from "react"
import { ClipboardPaste, Download, ExternalLink, Images, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { listingRows, normalizeListingUrl, parseListing, type ListingInfo } from "@/lib/listing"
import { canFetchListing, fetchListing } from "@/lib/listing-source"
import { importListingImages, type ListingImagesResult } from "@/lib/listing-images"

type Props = {
  listing: ListingInfo | null | undefined
  onImported: (info: ListingInfo) => void
  /** 初期表示の URL（案件に保存済みのもの） */
  defaultUrl?: string
  /** 指定すると、物件ページから外観・間取り図の画像も取り込み、間取り図を階ごとに切り出して渡す */
  onImages?: (result: ListingImagesResult) => void
}

/** 物件ページ（SUUMO）の URL から物件概要を取り込む。自動取得できないときは、ページの内容の貼り付けで取り込む */
export function ListingImport({ listing, onImported, defaultUrl, onImages }: Props) {
  const [url, setUrl] = useState(defaultUrl ?? listing?.url ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(!canFetchListing())
  const [pasted, setPasted] = useState("")
  const [withImages, setWithImages] = useState(true)
  const [step, setStep] = useState<string | null>(null)
  const [fetched, setFetched] = useState<ListingImagesResult | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const target = url.trim() ? normalizeListingUrl(url) : null

  const run = async () => {
    setBusy(true)
    setError(null)
    setImageError(null)
    setStep("物件概要を取得しています")
    try {
      const info = await fetchListing(url)
      onImported(info)
      toast.success(`物件情報を取り込みました（${listingRows(info).length} 項目）`)
      if (onImages && withImages) {
        // 画像の取り込みに失敗しても、物件情報の取り込みは生かす
        try {
          const r = await importListingImages(url, info.floors, setStep)
          setFetched(r)
          onImages(r)
          const parts = [r.exteriorLabel, r.floorsSplit ? `間取り図 ${r.floorsSplit} 階分` : Object.keys(r.images.floorplans).length ? "間取り図" : null].filter(Boolean)
          if (parts.length) toast.success(`${parts.join("・")}を取り込みました`)
          if (r.warning) toast.warning(r.warning)
        } catch (e) {
          setImageError(`画像を取り込めませんでした: ${e instanceof Error ? e.message : String(e)}。画像は作成後に追加できます`)
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setPasteOpen(true)
    } finally {
      setBusy(false)
      setStep(null)
    }
  }

  const fromPaste = () => {
    const info = parseListing(pasted, target?.url)
    if (!info.address && !info.buildingArea && !info.price) {
      setError("物件概要の項目（所在地・価格・建物面積など）が見つかりませんでした。物件概要のページ全体を選択してコピーしてください")
      return
    }
    setError(null)
    onImported({ ...info, fetchedAt: new Date().toISOString() })
    toast.success(`貼り付けた内容から物件情報を取り込みました（${listingRows(info).length} 項目）`)
  }

  const rows = listing ? listingRows(listing) : []
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3" data-tour="listing-import">
      <Label htmlFor="listing-url">物件ページの URL（SUUMO）</Label>
      <div className="flex gap-2">
        <Input
          id="listing-url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://suumo.jp/chukoikkodate/…/nc_12345678/"
          className="min-w-0 flex-1"
          onKeyDown={e => e.key === "Enter" && target && !busy && run()}
        />
        <Button type="button" className="shrink-0 gap-1" onClick={run} disabled={!target || busy} data-testid="listing-fetch">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? "取得中…" : "自動取得"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        物件概要（所在地・価格・建物面積・階数・道路など）を取り込みます。建物面積は間取り図の縮尺合わせに使い、3D の寸法が正確になります。
        {url.trim() && !target && <span className="block text-destructive">SUUMO の一戸建て・土地の物件ページの URL を入れてください。</span>}
      </p>
      {onImages && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={withImages} onChange={e => setWithImages(e.target.checked)} disabled={busy} data-testid="listing-with-images" />
          外観（完成予想図・外観写真）と間取り図の画像も取り込み、間取り図を階ごとに切り出す
        </label>
      )}
      {busy && <p className="text-xs text-muted-foreground" data-testid="listing-step">{step ?? "物件ページを取得しています"}（1 回につき 10〜30 秒かかることがあります）…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {imageError && <p className="text-xs text-destructive">{imageError}</p>}
      {fetched && (fetched.images.perspective || Object.keys(fetched.images.floorplans).length > 0) && (
        <div className="space-y-1" data-testid="listing-images">
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Images className="h-3.5 w-3.5" />取り込んだ画像（案件に保存されます）</p>
          <div className="flex flex-wrap gap-2">
            {fetched.images.perspective && (
              <figure className="w-24 min-w-0">
                <img src={fetched.images.perspective} alt={fetched.exteriorLabel ?? "外観"} className="aspect-[4/3] w-full rounded border bg-muted object-cover" />
                <figcaption className="truncate text-[11px] text-muted-foreground">{fetched.exteriorLabel ?? "外観"}</figcaption>
              </figure>
            )}
            {Object.entries(fetched.images.floorplans).map(([k, src]) => (
              <figure key={k} className="w-24 min-w-0">
                <img src={src} alt={`${Number(k) + 1}F`} className="aspect-[4/3] w-full rounded border bg-white object-contain" />
                <figcaption className="text-[11px] text-muted-foreground">{fetched.images.floorplanSheet ? `${Number(k) + 1}F` : "間取り図"}</figcaption>
              </figure>
            ))}
          </div>
          {fetched.warning && <p className="text-xs text-amber-600">{fetched.warning}</p>}
        </div>
      )}

      {pasteOpen ? (
        <div className="space-y-2">
          <Label htmlFor="listing-paste" className="text-xs">
            ページの内容を貼り付け（物件概要のページで全体を選択 → コピー）
            {target && (
              <a href={target.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-primary">
                物件概要を開く<ExternalLink className="h-3 w-3" />
              </a>
            )}
          </Label>
          <Textarea id="listing-paste" rows={4} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="所在地　東京都… / 価格　… / 建物面積　… など" />
          <Button type="button" size="sm" variant="outline" className="gap-1" onClick={fromPaste} disabled={!pasted.trim()}>
            <ClipboardPaste className="h-4 w-4" />貼り付けた内容から入力
          </Button>
        </div>
      ) : (
        <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setPasteOpen(true)}>
          自動取得できないときは、ページの内容を貼り付けて取り込む
        </button>
      )}

      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-card p-2 text-xs" data-testid="listing-rows">
          {rows.map(r => (
            <div key={r.label} className="contents">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
