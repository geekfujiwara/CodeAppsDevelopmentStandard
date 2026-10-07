
import { decodeConnectorText, normalizeListingUrl, parseListingHtml, parseListingImages, pickListingImages, type ListingImageRef, type ListingInfo } from "@/lib/listing"

type Result = { success: boolean; data?: unknown; error?: { message?: string } }

/**
 * コネクタの 3 つの操作（物件概要・物件ページ・物件画像）。画面を通す試験（?debug3d）では、SDK と同じ形の応答
 * （HTML は 1 バイト = 1 文字の文字列、画像は base64）を返す差し替えを window.__listingSourceMock に置ける
 */
type Source = {
  overview: (kind: string, pref: string, area: string, id: string) => Promise<Result>
  page: (kind: string, pref: string, area: string, id: string) => Promise<Result>
  image: (src: string, w: string, h: string) => Promise<Result>
}

// 物件ページ取得コネクタの生成サービス（`add_data_source.py --connector <shared_...>` で作られる。クラス名はコネクタの題名で変わる）。
// テンプレートから生成した直後（コネクタ未追加）でもビルドできるよう、操作 GetListingOverview を持つサービスを遅延読み込みで探す
const generated = import.meta.glob("../generated/services/*Service.ts")
type ListingService = {
  GetListingOverview(kind: string, pref: string, area: string, id: string): Promise<Result>
  GetListingPage(kind: string, pref: string, area: string, id: string): Promise<Result>
  GetListingImage(src: string, w: string, h: string): Promise<Result>
}
let listingService: Promise<ListingService | null> | undefined
function findListingService(): Promise<ListingService | null> {
  listingService ??= (async () => {
    for (const [path, load] of Object.entries(generated)) {
      if (path.endsWith("/MicrosoftDataverseService.ts")) continue
      const mod = (await load()) as Record<string, unknown>
      const svc = Object.values(mod).find(v => typeof v === "function" && typeof (v as unknown as ListingService).GetListingOverview === "function")
      if (svc) return svc as unknown as ListingService
    }
    return null
  })()
  return listingService
}
async function listingCall<K extends keyof ListingService>(op: K, ...args: Parameters<ListingService[K]>): Promise<Result> {
  const svc = await findListingService()
  if (!svc) return { success: false, error: { message: "物件ページ取得のコネクタがアプリに追加されていません（setup_listing_connector.py → add_data_source.py）" } }
  return (svc[op] as (...a: unknown[]) => Promise<Result>)(...args)
}
/** 物件ページ取得のコネクタがアプリに追加されているか（ビルド時に決まる） */
export const isListingConnectorConfigured = Object.keys(generated).some(p => !p.endsWith("/MicrosoftDataverseService.ts"))

const connector: Source = {
  overview: (...a) => listingCall("GetListingOverview", ...a),
  page: (...a) => listingCall("GetListingPage", ...a),
  image: (...a) => listingCall("GetListingImage", ...a),
}

function mockSource(): Source | null {
  if (typeof window === "undefined" || !/[?&]debug3d\b/.test(location.search + location.hash)) return null
  return (window as unknown as { __listingSourceMock?: Source }).__listingSourceMock ?? null
}

/** Power Apps の中で動いているか（コネクタはホスト経由でしか呼べない。ローカル開発・直接開いた URL では使えない） */
export function canFetchListing(): boolean {
  if (mockSource()) return true
  if (!isListingConnectorConfigured) return false
  try {

    return window.self !== window.top
  } catch {
    return true
  }
}

const source = () => mockSource() ?? connector

const TIMEOUT_MS = 60_000

async function call(run: () => Promise<Result>, what: string): Promise<Result> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what}の取得が時間内に終わりませんでした（60 秒）`)), TIMEOUT_MS))
  const result = await Promise.race([run(), timeout])
  if (!result.success) throw new Error(`${what}を取得できませんでした: ${result.error?.message ?? "不明なエラー"}`)
  return result
}

/** SDK は text/html を 1 バイト = 1 文字の文字列で返す（応答の型を宣言すると JSON として読もうとして失敗する） */
function htmlOf(result: Result): string {
  const data = result.data
  const body = typeof data === "string" ? data : data == null ? "" : JSON.stringify(data)
  return body ? decodeConnectorText(body) : ""
}

function targetOf(raw: string) {
  const target = normalizeListingUrl(raw)
  if (!target) throw new Error("SUUMO の一戸建て・土地の物件ページの URL を入れてください（例: https://suumo.jp/chukoikkodate/…/nc_12345678/）")
  if (!canFetchListing()) throw new Error(isListingConnectorConfigured ? "自動取得は Power Apps で開いたアプリでだけ使えます。ページの内容を貼り付けて取り込んでください" : "物件ページ取得のコネクタがまだ追加されていません。ページの内容を貼り付けて取り込んでください")
  return target
}

/**
 * 物件ページの URL から物件概要を取り込む。ブラウザから外部サイトは読めない（Code Apps の CSP）ので、
 * カスタム コネクタ（ホスト suumo.jp 固定・認証なし）経由で物件概要ページを 1 回だけ取得して読む
 */
export async function fetchListing(raw: string): Promise<ListingInfo> {
  const target = targetOf(raw)
  const [kind, pref, area, id] = target.segments
  const html = htmlOf(await call(() => source().overview(kind, pref, area, id), "物件ページ"))
  if (!html) throw new Error("物件ページの内容が空でした。もう一度試すか、ページの内容を貼り付けてください")
  const info = parseListingHtml(html, target.url)
  if (!info.address && !info.buildingArea) throw new Error("物件概要を読み取れませんでした（掲載が終了したか、ページの構成が変わった可能性があります）。ページの内容を貼り付けてください")
  return { ...info, fetchedAt: new Date().toISOString() }
}

/** 物件ページから、取り込む外観・間取り図の画像の一覧を読む（1 回の取得） */
export async function fetchListingImageRefs(raw: string): Promise<{ exterior?: ListingImageRef; floorplans: ListingImageRef[] }> {
  const target = targetOf(raw)
  const [kind, pref, area, id] = target.segments
  const html = htmlOf(await call(() => source().page(kind, pref, area, id), "物件ページ"))
  return pickListingImages(parseListingImages(html))
}

/** 物件画像（1000px に収めた JPEG）を data URL で取得する。SDK は image/* の応答を base64 の文字列で返す */
export async function fetchListingImage(ref: ListingImageRef): Promise<string> {
  if (!/^gazo\//.test(ref.src)) throw new Error("取り込めない画像です")
  const result = await call(() => source().image(ref.src, "1000", "1000"), `画像（${ref.alt}）`)
  const data = typeof result.data === "string" ? result.data.replace(/\s+/g, "") : ""
  const mime = data.startsWith("/9j/") ? "image/jpeg" : data.startsWith("iVBOR") ? "image/png" : data.startsWith("R0lGOD") ? "image/gif" : null
  if (!mime) throw new Error(`画像（${ref.alt}）の形式を読めませんでした`)
  return `data:${mime};base64,${data}`
}
