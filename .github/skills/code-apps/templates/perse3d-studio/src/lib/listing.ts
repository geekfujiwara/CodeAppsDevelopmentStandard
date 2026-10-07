/**
 * 不動産ポータル（SUUMO 等）の物件概要から、案件と 3D 化に使う値を取り出す。
 * - HTML（コネクタで取得したページ）と、ページを選択してコピーした文字列のどちらも受け付ける
 * - 値は表示用の文字列（price 等）と、3D に使う数値（面積・階数・道路の向きと幅）に分ける
 * 取得は利用者の操作ごとに 1 ページだけ（巡回・画像の取得はしない）
 */

export type Compass = "北" | "北東" | "東" | "南東" | "南" | "南西" | "西" | "北西"

export type ListingInfo = {
  url?: string
  /** ページの題名から取った物件名（例: サンプル市本町1丁目 中古戸建） */
  title?: string
  address?: string
  price?: string
  layout?: string
  /** 延床面積（m²） */
  buildingArea?: number
  /** 土地面積（m²） */
  landArea?: number
  /** 構造・工法の文字列（例: 木造2階建） */
  structure?: string
  /** 地上の階数 */
  floors?: number
  builtYear?: string
  /** 建ぺい率・容積率（%） */
  coverage?: number
  floorAreaRatio?: number
  /** 接道（私道負担・道路）。最初に書かれた道路の向きと幅 */
  road?: { direction?: Compass; width?: number; raw: string }
  access?: string
  zoning?: string
  parking?: string
  /** 取り込んだ日時（ISO） */
  fetchedAt?: string
}

/** 物件概要の見出し → 項目。SUUMO の表記ゆれ（「ヒント」付き・全角）も含める */
const LABELS: [RegExp, keyof ListingInfo | "roadRaw" | "areaRaw" | "landRaw" | "coverageRaw"][] = [
  [/^所在地$/, "address"],
  [/^交通$/, "access"],
  [/^価格$/, "price"],
  [/^間取り$/, "layout"],
  [/^建物面積$/, "areaRaw"],
  [/^延床面積$/, "areaRaw"],
  [/^土地面積$/, "landRaw"],
  [/^建ぺい率・容積率$/, "coverageRaw"],
  [/^完成時期\(築年月\)$|^築年月$/, "builtYear"],
  [/^構造・工法$/, "structure"],
  [/^私道負担・道路$|^接道状況$/, "roadRaw"],
  [/^用途地域$/, "zoning"],
  [/^駐車場$/, "parking"],
]

const clean = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/\s*ヒント\s*$/, "")
    .trim()

const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

/** 「64.39m 2 （19.47坪）」「64.39㎡」「64.39m²」→ 64.39。1 階・2 階の内訳が並ぶ場合は合計の値（最初の数値）を使う */
export function parseArea(s: string | undefined): number | undefined {
  if (!s) return undefined
  const t = s.normalize("NFKC")
  const m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:m\s*2|m²|㎡|平米)/)
  const v = m ? Number(m[1]) : undefined
  return v && v > 0 && v < 100000 ? v : undefined
}

/** 「木造2階建」「鉄骨造3階建」「木造2階建て/地下1階」→ 2 / 3 */
export function parseFloors(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = s.normalize("NFKC").match(/(\d+)\s*階建/)
  const v = m ? Number(m[1]) : undefined
  return v && v >= 1 && v <= 10 ? v : undefined
}

const COMPASS: Compass[] = ["北東", "南東", "南西", "北西", "北", "東", "南", "西"]

/** 「無、北西4ｍ幅」「公道 南 6.0m」「北西側 幅員4m」→ { direction: 北西, width: 4 } */
export function parseRoad(s: string | undefined): ListingInfo["road"] {
  if (!s) return undefined
  const t = s.normalize("NFKC")
  const direction = COMPASS.find(c => t.includes(c))
  const m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*m/)
  const width = m ? Number(m[1]) : undefined
  return { raw: clean(s), ...(direction ? { direction } : {}), ...(width && width < 50 ? { width } : {}) }
}

function assign(info: ListingInfo, key: (typeof LABELS)[number][1], value: string) {
  const v = clean(value)
  if (!v || v === "-") return
  switch (key) {
    case "areaRaw":
      info.buildingArea ??= parseArea(v)
      break
    case "landRaw":
      info.landArea ??= parseArea(v)
      break
    case "coverageRaw": {
      const nums = v.match(/[0-9]+(?:\.[0-9]+)?/g)?.map(Number) ?? []
      if (nums[0]) info.coverage = nums[0]
      if (nums[1]) info.floorAreaRatio = nums[1]
      break
    }
    case "roadRaw":
      info.road = parseRoad(v)
      break
    case "structure":
      info.structure = v
      info.floors = parseFloors(v)
      break
    case "price":
      info.price = v.replace(/\s*\[.*$/, "").trim()
      break
    case "access":
      info.access = v.replace(/\s*\[\s*乗り換え案内\s*\]/g, "").trim()
      break
    default:
      ;(info as Record<string, unknown>)[key] = v
  }
}

const labelOf = (th: string) => {
  const t = clean(th)
  return LABELS.find(([re]) => re.test(t))?.[1]
}

/** 取り込まない見出し（貼り付けた文字列で、値の終わりを見つけるのに使う）。「〜 ヒント」の付いた行も見出し */
const OTHER_HEADINGS = new Set([
  "販売スケジュール", "イベント情報", "販売戸数", "総戸数", "最多価格帯", "諸費用", "引渡可能時期", "土地の権利形態",
  "エネルギー消費性能", "断熱性能", "目安光熱費", "施工", "リフォーム", "地目", "その他制限事項", "その他概要・特記事項",
  "会社概要", "問い合わせ先", "情報提供日", "次回更新予定日", "取引条件有効期限", "物件番号", "設備・条件", "備考",
])
const isHeading = (line: string) => {
  if (labelOf(line)) return true
  const raw = line.normalize("NFKC").trim()
  return /\sヒント$/.test(raw) || OTHER_HEADINGS.has(clean(line))
}

/** 題名「【SUUMO】サンプル市本町1丁目 中古戸建 - 物件概要 | …」→ 物件名 */
function titleOf(raw: string): string | undefined {
  const t = clean(decode(raw))
    .replace(/^【[^】]*】\s*/, "")
    .replace(/\s*[-|｜].*$/, "")
    .trim()
  return t || undefined
}

/** 文字列の中の「N階建」で最も多い N（1〜10） */
function mostFloors(text: string): number | undefined {
  const count = new Map<number, number>()
  for (const m of text.normalize("NFKC").matchAll(/(\d+)\s*階建/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= 10) count.set(n, (count.get(n) ?? 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]
}

/** 物件概要ページの HTML から取り出す（見出し th → 値 td の組） */
export function parseListingHtml(html: string, url?: string): ListingInfo {
  const info: ListingInfo = { ...(url ? { url } : {}) }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (title) info.title = titleOf(title[1])
  for (const m of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const key = labelOf(decode(m[1]))
    if (key) assign(info, key, decode(m[2]))
  }
  // 新築の物件概要は「構造・工法」が「-」のことがある。ページの中の「N階建」（最も多いもの）で補う
  // （「２階建」は物件の特徴のタグとして script の中にも入る）
  info.floors ??= mostFloors(decode(html))
  return info
}

/**
 * ページを選択してコピーした文字列から取り出す。見出しと値はタブ・改行で区切られる。
 * 見出しの行（「所在地」「建物面積 ヒント」など）の後ろ、次の見出しまでを値とする
 */
export function parseListingText(text: string, url?: string): ListingInfo {
  const info: ListingInfo = { ...(url ? { url } : {}) }
  const lines = text
    .split(/\r?\n/)
    .flatMap(l => l.split("\t"))
    .map(l => l.trim())
    .filter(Boolean)
  const first = lines.find(l => /【SUUMO】|中古戸建|新築|一戸建/.test(l))
  if (first) info.title = titleOf(first)
  for (let i = 0; i < lines.length; i++) {
    const key = labelOf(lines[i])
    if (!key) continue
    const value: string[] = []
    for (let j = i + 1; j < lines.length && !isHeading(lines[j]); j++) value.push(lines[j])
    if (value.length) assign(info, key, value.join(" "))
  }
  info.floors ??= mostFloors(text)
  return info
}

/** HTML でも文字列でも受け付ける */
export function parseListing(content: string, url?: string): ListingInfo {
  return /<t[hd][\s>]/i.test(content) ? parseListingHtml(content, url) : parseListingText(content, url)
}

/**
 * 取り込める URL か（SUUMO の一戸建て・土地の物件ページ）。物件概要（bukkengaiyo）のページの URL にそろえ、
 * コネクタの操作に渡すパスの 4 つの部分（種類・都道府県・市区町村・物件番号）を返す。
 * 例: https://suumo.jp/chukoikkodate/tokyo/sc_xxx/nc_12345678/?fmlg=t001
 *   → https://suumo.jp/chukoikkodate/tokyo/sc_xxx/nc_12345678/bukkengaiyo/
 */
export function normalizeListingUrl(raw: string): { url: string; path: string; segments: [string, string, string, string] } | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" || !/(^|\.)suumo\.jp$/.test(u.hostname)) return null
  const m = u.pathname.match(/^\/(chukoikkodate|ikkodate|tochi)\/([a-z_]+)\/([a-z0-9_]+)\/(nc_\d+)\//)
  if (!m) return null
  const segments: [string, string, string, string] = [m[1], m[2], m[3], m[4]]
  const path = `/${segments.join("/")}/bukkengaiyo/`
  return { url: `https://suumo.jp${path}`, path, segments }
}

/**
 * コネクタが返した HTML の文字列を正しい文字に戻す。
 * Power Apps の SDK は JSON 以外の応答（text/html）を 1 バイト = 1 文字で文字列にする（UTF-8 の日本語が化ける）。
 * すべての文字が 0〜255 なら元のバイト列に戻し、ページの charset（無ければ UTF-8）で読み直す。既に正しい文字列ならそのまま
 */
export function decodeConnectorText(s: string): string {
  let high = false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s
    if (c >= 0x80) high = true
  }
  if (!high) return s
  const bytes = Uint8Array.from(s, ch => ch.charCodeAt(0))
  const head = s.slice(0, 4096)
  const charset = (head.match(/charset\s*=\s*["']?([A-Za-z0-9_-]+)/i)?.[1] ?? "utf-8").toLowerCase()
  const label = /^(shift[_-]?jis|sjis|x-sjis|windows-31j|cp932|ms932)$/.test(charset) ? "shift_jis" : /^euc-?jp$/.test(charset) ? "euc-jp" : "utf-8"
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}

/** 物件ページの画像（SUUMO の resizeImage の src。robots.txt で許可された gazo/ 配下だけ） */
export type ListingImageRef = { src: string; alt: string; kind: "perspective" | "exterior" | "floorplan" }

/**
 * 物件ページの HTML から、外観（完成予想図・現地外観写真）と間取り図の画像を取り出す（掲載順、重複なし）。
 * 画像は遅延読み込みで `rel` / `data-src` / `src` のどれかに resizeImage の URL が入る
 */
export function parseListingImages(html: string): ListingImageRef[] {
  const out: ListingImageRef[] = []
  const seen = new Set<string>()
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const url = tag.match(/(?:rel|data-src|src)\s*=\s*"([^"]*resizeImage\?[^"]+)"/i)?.[1]
    const alt = clean(decode(tag.match(/\balt\s*=\s*"([^"]*)"/i)?.[1] ?? ""))
    if (!url || !alt) continue
    let src: string | null = null
    try {
      src = new URL(decode(url), "https://suumo.jp/").searchParams.get("src")
    } catch {
      continue
    }
    if (!src || !/^gazo\//.test(src) || seen.has(src)) continue
    const kind = /完成予想図\s*\(外観\)|外観パース/.test(alt) ? "perspective" : /外観写真/.test(alt) ? "exterior" : /^間取り図$/.test(alt) ? "floorplan" : null
    if (!kind) continue
    seen.add(src)
    out.push({ src, alt, kind })
  }
  return out
}

/** 取り込む画像を選ぶ: 外観は完成予想図（外観）→ 現地外観写真の順に 1 枚、間取り図は掲載順に最大 3 枚（階に分けられる図面を順に探す） */
export function pickListingImages(refs: ListingImageRef[]): { exterior?: ListingImageRef; floorplans: ListingImageRef[] } {
  const exterior = refs.find(r => r.kind === "perspective") ?? refs.find(r => r.kind === "exterior")
  return { ...(exterior ? { exterior } : {}), floorplans: refs.filter(r => r.kind === "floorplan").slice(0, 3) }
}

/** 「1580万円」「1億2000万円」「2,480万円（税込）」→ 円。読めなければ null */
export function parseYen(s: string | undefined): number | null {
  if (!s) return null
  const t = s.normalize("NFKC").replace(/,/g, "")
  const m = t.match(/(?:(\d+(?:\.\d+)?)\s*億)?\s*(?:(\d+(?:\.\d+)?)\s*万)?\s*円/)
  if (!m || (!m[1] && !m[2])) return null
  const v = Math.round((Number(m[1] ?? 0) * 1e8 + Number(m[2] ?? 0) * 1e4))
  return v > 0 && v < 1e11 ? v : null
}

/** 取り込んだ値のうち空でないもの（画面に並べる順） */
export function listingRows(info: ListingInfo): { label: string; value: string }[] {
  const rows: [string, string | undefined][] = [
    ["物件名", info.title],
    ["所在地", info.address],
    ["価格", info.price],
    ["間取り", info.layout],
    ["建物面積", info.buildingArea ? `${info.buildingArea} m²` : undefined],
    ["土地面積", info.landArea ? `${info.landArea} m²` : undefined],
    ["構造", info.structure],
    ["築年月", info.builtYear],
    ["建ぺい率・容積率", info.coverage ? `${info.coverage}%・${info.floorAreaRatio ?? "-"}%` : undefined],
    ["道路", info.road?.raw],
    ["用途地域", info.zoning],
    ["交通", info.access],
  ]
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value }))
}

/** 物件の値から、案件のメモに残す文（取り込み元 URL・取得日つき） */
export function listingNotes(info: ListingInfo): string {
  const lines = listingRows(info).map(r => `${r.label}: ${r.value}`)
  if (info.url) lines.push(`取り込み元: ${info.url}${info.fetchedAt ? `（${info.fetchedAt.slice(0, 10)} 取得）` : ""}`)
  return lines.join("\n")
}

/**
 * 延床面積に合わせる縮尺の倍率。各階の床面積は横幅の 2 乗に比例するので、今の床面積の合計 sum から √(延床面積 / sum)。
 * 図面が物件の階数より少なければ（1 階だけ取り込んだ等）、各階は同じ広さとみなして取り込んだ階の分だけ比べる
 */
export function areaScale(floorAreas: number[], buildingArea: number, floors?: number): number | null {
  const sum = floorAreas.reduce((a, b) => a + b, 0)
  if (!(sum > 0) || !(buildingArea > 0)) return null
  const target = floors && floorAreas.length < floors ? (buildingArea * floorAreas.length) / floors : buildingArea
  const k = Math.sqrt(target / sum)
  return Number.isFinite(k) && k > 0.2 && k < 5 ? k : null
}

/** 延床面積から、間取り図の横幅（m）を決める（今の横幅 × areaScale） */
export function widthFromFloorArea(currentWidth: number, floorAreas: number[], buildingArea: number, floors?: number): number | null {
  const k = areaScale(floorAreas, buildingArea, floors)
  if (!k || !(currentWidth > 0)) return null
  const w = currentWidth * k
  return w > 1 && w < 60 ? Math.round(w * 100) / 100 : null
}

/**
 * 全階で共通の横幅を、延床面積から決める（同じ建物の図面なので、各階の外形の横幅は同じとみなす）。
 * widths[i] は i 階の今の横幅、areas[i] はその横幅で測った床面積。いったん 1 階の横幅にそろえた面積で比べる
 */
export function commonWidthFromFloorArea(widths: number[], areas: number[], buildingArea: number, floors?: number): number | null {
  if (!widths.length || widths.length !== areas.length || widths.some(w => !(w > 0))) return null
  const w0 = widths[0]
  const scaled = areas.map((a, i) => a * (w0 / widths[i]) ** 2)
  return widthFromFloorArea(w0, scaled, buildingArea, floors)
}

/**
 * 延床面積に合わせた各階の横幅（m）。
 * - 別々の画像（階ごとに撮影・切り抜き）: 全階で共通の横幅（同じ建物の外形）
 * - 1 枚の画像から切り出した階（sheetPx に各階の壁の外接矩形の画素幅）: 縮尺（1m あたりの画素）が共通なので、画素幅の比を保つ
 * widths は今の横幅、areas はその横幅で測った床面積。合わせられなければ null
 */
export function fitFloorWidths(widths: number[], areas: number[], buildingArea: number, floors?: number, sheetPx?: number[]): number[] | null {
  if (!widths.length || widths.length !== areas.length || widths.some(w => !(w > 0))) return null
  if (sheetPx && sheetPx.length === widths.length && sheetPx.every(p => p > 0)) {
    const ratio = sheetPx.map(p => widths[0] * (p / sheetPx[0]))
    const adjusted = areas.map((a, i) => a * (ratio[i] / widths[i]) ** 2)
    const k = areaScale(adjusted, buildingArea, floors)
    return k ? ratio.map(w => Math.round(w * k * 100) / 100) : null
  }
  const w = commonWidthFromFloorArea(widths, areas, buildingArea, floors)
  return w ? widths.map(() => w) : null
}

/** 間取りの表記から居室数（LDK・DK・K を除く。S・納戸は数えない）。「3LDK」→ 3、「2SLDK」→ 2、「3LDK・4LDK」→ 3（最初） */
export function bedroomsOf(layout: string | undefined): number | null {
  const m = (layout ?? "").normalize("NFKC").match(/(\d+)\s*S?\s*(LDK|DK|LK|K)/)
  return m ? Number(m[1]) : null
}
