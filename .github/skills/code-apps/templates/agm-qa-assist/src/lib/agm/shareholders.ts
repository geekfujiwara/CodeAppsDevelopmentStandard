import { MicrosoftDataverseService } from "./services"
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, col } from "./config"
import { errorText, withTimeout } from "./corpus"
export { foldName, matchShareholders } from "./match"

const log = createLogger("shareholder")

type Row = Record<string, unknown>

export interface Shareholder {
  rowId?: string
  number: string
  name: string
  kana: string
  shares: number
  type: string
  since: string
  note: string
}

export interface PastQuestion {
  seq: number
  category: string
  excerpt: string
  qaCode: string
}

export interface PastTurn {
  id: string
  meeting: string
  startedAt: string
  durationSec: number
  questions: PastQuestion[]
}

export interface ShareholderProfile {
  number: string
  shareholder: Shareholder | null
  history: PastTurn[]
  source: "dataverse" | "local-demo"
  ms: number
  error?: string
}

const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"
const str = (row: Row, name: string) => (row[name] === null || row[name] === undefined ? "" : String(row[name]))

async function list(entity: string, select: string[], filter: string, orderby?: string, expand?: string, top = 50): Promise<Row[]> {
  const result = await withTimeout(
    MicrosoftDataverseService.ListRecordsWithOrganization(
      DATAVERSE_URL,
      entity,
      'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      "application/json",
      undefined,
      undefined,
      select.join(","),
      filter || undefined,
      orderby,
      expand,
      undefined,
      top,
    ),
    15000,
    `${entity} の取得`,
  )
  if (!result.success) throw new Error(`${entity} の取得に失敗しました: ${errorText(result.error)}`)
  return (result.data as { value?: Row[] } | undefined)?.value ?? []
}

const escape = (value: string) => value.replaceAll("'", "''")

/** 先頭の 0 の有無の聞き違い（「123」と「0123」）を吸収するため、照会する番号の候補を作る */
export function numberVariants(number: string, width = 4): string[] {
  const stripped = number.replace(/^0+(?=\d)/, "")
  return [...new Set([number, stripped, stripped.padStart(width, "0")])]
}

async function fromDataverse(number: string, excludeTurnIds: ReadonlySet<string>): Promise<Omit<ShareholderProfile, "ms" | "source" | "number">> {
  const shIdCol = `${ENTITY.shareholder.slice(0, -1)}id`
  const turnIdCol = `${ENTITY.turn.slice(0, -1)}id`
  const [holders, turns] = await Promise.all([
    list(ENTITY.shareholder, [shIdCol, ...["name", "shareholdername", "kana", "shares", "holdertype", "since", "note"].map(col)], numberVariants(number).map((n) => `${col("name")} eq '${escape(n)}'`).join(" or ")),
    list(ENTITY.turn, [turnIdCol, col("startedat"), col("durationsec"), `_${col("meetingid")}_value`], numberVariants(number).map((n) => `${col("shareholdernumber")} eq '${escape(n)}'`).join(" or "), `${col("startedat")} desc`),
  ])
  // 完全一致を優先し、無ければ先頭の 0 を補った番号で一致したものを使う
  const row = holders.find((h) => str(h, col("name")) === number) ?? holders[0]
  const shareholder: Shareholder | null = row
    ? {
        rowId: str(row, shIdCol),
        number: str(row, col("name")) || number,
        name: str(row, col("shareholdername")),
        kana: str(row, col("kana")),
        shares: Number(row[col("shares")] ?? 0),
        type: str(row, col("holdertype")),
        since: str(row, col("since")),
        note: str(row, col("note")),
      }
    : null
  const past = turns.filter((t) => !excludeTurnIds.has(str(t, turnIdCol)))
  let questions: Row[] = []
  if (past.length) {
    const filter = past.map((t) => `_${col("turnid")}_value eq ${str(t, turnIdCol)}`).join(" or ")
    questions = await list(ENTITY.question, [col("seq"), col("category"), col("excerpt"), col("qacode"), `_${col("turnid")}_value`], filter, `${col("seq")} asc`)
  }
  const history: PastTurn[] = past.map((t) => {
    const id = str(t, turnIdCol)
    return {
      id,
      meeting: str(t, `_${col("meetingid")}_value@OData.Community.Display.V1.FormattedValue`),
      startedAt: str(t, col("startedat")),
      durationSec: Number(t[col("durationsec")] ?? 0),
      questions: questions
        .filter((q) => str(q, `_${col("turnid")}_value`) === id)
        .map((q) => ({ seq: Number(q[col("seq")] ?? 0), category: str(q, col("category")), excerpt: str(q, col("excerpt")), qaCode: str(q, col("qacode")) })),
    }
  })
  return { shareholder, history }
}

async function fromLocal(number: string): Promise<Omit<ShareholderProfile, "ms" | "source" | "number">> {
  const [holders, history] = await Promise.all([import("../../../data/demo/shareholders.json"), import("../../../data/demo/shareholder-history.json")])
  const variants = numberVariants(number)
  const h = (holders.default as { number: string; name: string; kana: string; shares: number; type: string; since: string; note: string }[]).find((x) => variants.includes(x.number))
  return {
    shareholder: h ? { number: h.number, name: h.name, kana: h.kana, shares: h.shares, type: h.type, since: h.since, note: h.note } : null,
    history: history.default.turns
      .filter((t) => variants.includes(t.shareholderNumber))
      .map((t) => ({ id: t.code, meeting: history.default.meeting.title, startedAt: t.startedAt, durationSec: t.durationSec, questions: t.questions })),
  }
}

const cache = new Map<string, Promise<ShareholderProfile>>()

/**
 * 株主番号から名簿の情報と、過去の発言・質問を引く。同じ番号は 1 回だけ問い合わせる
 * （本日の発言は保存後に refresh=true で引き直す）。
 */
export function lookupShareholder(number: string, options: { refresh?: boolean; excludeTurnIds?: ReadonlySet<string> } = {}): Promise<ShareholderProfile> {
  if (!options.refresh && cache.has(number)) return cache.get(number)!
  const t0 = performance.now()
  const promise = (localMode() ? fromLocal(number) : fromDataverse(number, options.excludeTurnIds ?? new Set()))
    .then((r) => {
      const profile: ShareholderProfile = { number, ...r, source: localMode() ? "local-demo" : "dataverse", ms: Math.round(performance.now() - t0) }
      log.info("株主情報を取得", { number, found: !!r.shareholder, history: r.history.length, ms: profile.ms })
      return profile
    })
    .catch((error) => {
      log.warn("株主情報を取得できません", { number, error: errorText(error) })
      cache.delete(number)
      return { number, shareholder: null, history: [], source: "dataverse" as const, ms: Math.round(performance.now() - t0), error: errorText(error) }
    })
  cache.set(number, promise)
  return promise
}

/** 名乗った名前（姓だけのことが多い）が名簿の氏名と合うか */
export function nameMatches(spoken: string | null, registered: string | undefined): boolean | null {
  if (!spoken || !registered) return null
  const a = spoken.replace(/\s/g, "")
  const b = registered.replace(/\s/g, "")
  return b.startsWith(a) || a.startsWith(b)
}

export type ShareholderRow = Shareholder

const HOLDER_COLUMNS = ["name", "shareholdername", "kana", "shares", "holdertype", "since", "note"]

function toShareholder(row: Row): Shareholder {
  const idCol = `${ENTITY.shareholder.slice(0, -1)}id`
  return {
    rowId: str(row, idCol),
    number: str(row, col("name")),
    name: str(row, col("shareholdername")),
    kana: str(row, col("kana")),
    shares: Number(row[col("shares")] ?? 0),
    type: str(row, col("holdertype")),
    since: str(row, col("since")),
    note: str(row, col("note")),
  }
}

let registerCache: Promise<Shareholder[]> | null = null

/** 名簿をまとめて読む（モーダルの一覧と名前検索に使う。500 件まで。規模が大きい場合はサーバー側の検索に切り替える） */
export function loadRegister(refresh = false): Promise<Shareholder[]> {
  if (registerCache && !refresh) return registerCache
  registerCache = (async () => {
    if (localMode()) {
      const holders = await import("../../../data/demo/shareholders.json")
      return (holders.default as { number: string; name: string; kana: string; shares: number; type: string; since: string; note: string }[]).map((h) => ({
        number: h.number,
        name: h.name,
        kana: h.kana,
        shares: h.shares,
        type: h.type,
        since: h.since,
        note: h.note,
      }))
    }
    const idCol = `${ENTITY.shareholder.slice(0, -1)}id`
    const rows = await list(ENTITY.shareholder, [idCol, ...HOLDER_COLUMNS.map(col)], "", col("name"), undefined, 500)
    log.info("株主名簿を読み込みました", { count: rows.length })
    return rows.map(toShareholder)
  })().catch((error) => {
    registerCache = null
    throw error
  })
  return registerCache
}