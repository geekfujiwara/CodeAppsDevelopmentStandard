// LIVE 共有: 担当者（1 人）が画面の状態を Dataverse の LIVE レコードへ書き、
// 共有された幹部は読み取り専用で取りに行く。共有はレコード単位の GrantAccess（ReadAccess）で行う。
import { getContext } from "@microsoft/power-apps/app"
import { MicrosoftDataverseService } from "./services"
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, col } from "./config"
import { errorText, withTimeout } from "./corpus"
import type { Generation } from "@/hooks/use-generations"
import type { Card } from "./engine"
import type { QaDoc, Span, TranscriptView } from "./types"

const log = createLogger("live")
const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"
type Row = Record<string, unknown>

export interface Viewer {
  id: string
  name: string
  email: string
}

export interface LiveSession {
  id: string
  title: string
  status: "live" | "ended" | string
  revision: number
  viewers: Viewer[]
  ownerName: string
  ownerObjectId: string
  modifiedOn: string
}

export interface LiveCard {
  id: string
  span: Span
  text: string
  category: string
  confidence: number
  novel: boolean
  candidates: { id: string; score: number; matched: string[] }[]
  adoptedQaId?: string
}

export interface LiveState {
  v: 1
  at: number
  meetingTitle: string
  running: boolean
  elapsedSec: number
  turnKey: string
  shareholder: { number: string | null; source: string | null; name: string; kana: string; shares?: number; type?: string; note?: string; spokenName: string | null }
  view: TranscriptView
  answerFrom: number
  cards: LiveCard[]
  gens: Record<string, Generation>
  selectedId?: string
  recent: { number: string; name: string; startedAt: string; questions: number; categories: string[] }[]
}

/** 画面のカードを、閲覧側で想定問答（同じものを読み込み済み）から復元できる最小の形にする */
export function packCards(cards: Card[]): LiveCard[] {
  return cards.map((c) => ({
    id: c.id,
    span: c.segment.span,
    text: c.segment.text,
    category: c.segment.category,
    confidence: c.segment.confidence,
    novel: c.segment.novel,
    candidates: c.segment.candidates.slice(0, 3).map((h) => ({ id: h.doc.id, score: h.score, matched: h.matched })),
    adoptedQaId: c.adoptedQaId,
  }))
}

export function unpackCards(cards: LiveCard[], qa: Map<string, QaDoc>): Card[] {
  return cards.map((c) => ({
    id: c.id,
    adoptedQaId: c.adoptedQaId,
    segment: {
      span: c.span,
      text: c.text,
      category: c.category,
      confidence: c.confidence,
      novel: c.novel,
      candidates: c.candidates.flatMap((h) => {
        const doc = qa.get(h.id)
        return doc ? [{ doc, score: h.score, matched: h.matched }] : []
      }),
    },
  }))
}

const ENTITY_LIVE = () => ENTITY.live
const idCol = () => `${ENTITY_LIVE().slice(0, -1)}id`
const parseViewers = (raw: unknown): Viewer[] => {
  try {
    const v = JSON.parse(String(raw ?? "[]"))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function toSession(r: Row): LiveSession {
  const owner = (r.owninguser ?? {}) as Row
  return {
    id: String(r[idCol()]),
    title: String(r[col("name")] ?? ""),
    status: String(r[col("status")] ?? ""),
    revision: Number(r[col("revision")] ?? 0),
    viewers: parseViewers(r[col("viewers")]),
    ownerName: String(owner.fullname ?? r["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ?? ""),
    ownerObjectId: String(owner.azureactivedirectoryobjectid ?? ""),
    modifiedOn: String(r.modifiedon ?? ""),
  }
}

async function call<T>(promise: Promise<{ success: boolean; data?: T; error?: unknown }>, what: string, ms = 20000): Promise<T | undefined> {
  const result = await withTimeout(promise, ms, what)
  if (!result.success) throw new Error(`${what}に失敗しました: ${errorText(result.error)}`)
  return result.data
}

let me: Promise<{ objectId: string; name: string }> | null = null
/** 自分（Entra のオブジェクト ID）。LIVE の配信者かどうかの判定に使う */
export function currentUser(): Promise<{ objectId: string; name: string }> {
  me ??= Promise.race([
    getContext().then((ctx) => {
      const user = (ctx as { user?: { objectId?: string; fullName?: string } }).user ?? {}
      return { objectId: user.objectId ?? "", name: user.fullName ?? "" }
    }),
    // ホストの外（テスト用の配信）では応答しないため、待ち続けない
    new Promise<{ objectId: string; name: string }>((resolve) => window.setTimeout(() => resolve({ objectId: "", name: "" }), 4000)),
  ]).catch(() => ({ objectId: "", name: "" }))
  return me
}

/** 見える LIVE（自分が配信中のもの + 共有されたもの）。status = live だけ */
export async function listLiveSessions(): Promise<LiveSession[]> {
  if (localMode()) return localSessions().filter((s) => s.status === "live")
  const data = await call(
    MicrosoftDataverseService.ListRecordsWithOrganization(
      DATAVERSE_URL,
      ENTITY_LIVE(),
      'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
      "application/json",
      undefined,
      undefined,
      [idCol(), col("name"), col("status"), col("revision"), col("viewers"), "modifiedon", "_ownerid_value"].join(","),
      `${col("status")} eq 'live'`,
      "modifiedon desc",
      "owninguser($select=fullname,azureactivedirectoryobjectid)",
      undefined,
      20,
    ),
    "LIVE の一覧",
  )
  return (((data as { value?: Row[] } | undefined)?.value ?? []) as Row[]).map(toSession)
}

export async function startLive(title: string, meetingId?: string): Promise<LiveSession> {
  if (localMode()) {
    const s: LiveSession = { id: `local-live-${Date.now()}`, title, status: "live", revision: 0, viewers: [], ownerName: "テスト", ownerObjectId: "local", modifiedOn: new Date().toISOString() }
    saveLocal([s, ...localSessions()], {})
    return s
  }
  const data = await call(
    MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", DATAVERSE_URL, ENTITY_LIVE(), {
      [col("name")]: title,
      [col("status")]: "live",
      [col("revision")]: 0,
      [col("viewers")]: "[]",
      ...(meetingId && meetingId !== "local" ? { [`${col("meetingid")}@odata.bind`]: `/${ENTITY.meeting}(${meetingId})` } : {}),
    }),
    "LIVE の開始",
  )
  const session = toSession((data as unknown as Row) ?? {})
  log.info("LIVE を開始しました", { id: session.id, title })
  return session
}

async function patch(id: string, item: Row, what: string) {
  await call(MicrosoftDataverseService.UpdateRecordWithOrganization("return=minimal", "application/json", DATAVERSE_URL, ENTITY_LIVE(), id, item), what)
}

const target = (liveId: string) => ({ "@odata.type": `Microsoft.Dynamics.CRM.${ENTITY_LIVE().slice(0, -1)}`, [idCol()]: liveId })
const principal = (userId: string) => ({ "@odata.type": "Microsoft.Dynamics.CRM.systemuser", systemuserid: userId })

/** 閲覧者を追加: レコードの読み取りだけを共有し（GrantAccess）、一覧にも残す */
export async function addViewer(session: LiveSession, viewer: Viewer): Promise<Viewer[]> {
  if (localMode()) return updateLocal(session.id, (s) => ({ ...s, viewers: [...s.viewers.filter((v) => v.id !== viewer.id), viewer] })).viewers
  await call(
    MicrosoftDataverseService.PerformUnboundActionWithOrganization(DATAVERSE_URL, "GrantAccess", { Target: target(session.id), PrincipalAccess: { Principal: principal(viewer.id), AccessMask: "ReadAccess" } }),
    "閲覧の共有",
  )
  const viewers = [...session.viewers.filter((v) => v.id !== viewer.id), viewer]
  await patch(session.id, { [col("viewers")]: JSON.stringify(viewers) }, "閲覧者の記録")
  log.info("閲覧を共有しました", { live: session.id, viewer: viewer.name })
  return viewers
}

export async function removeViewer(session: LiveSession, viewerId: string): Promise<Viewer[]> {
  if (localMode()) return updateLocal(session.id, (s) => ({ ...s, viewers: s.viewers.filter((v) => v.id !== viewerId) })).viewers
  await call(MicrosoftDataverseService.PerformUnboundActionWithOrganization(DATAVERSE_URL, "RevokeAccess", { Target: target(session.id), Revokee: principal(viewerId) }), "閲覧の解除")
  const viewers = session.viewers.filter((v) => v.id !== viewerId)
  await patch(session.id, { [col("viewers")]: JSON.stringify(viewers) }, "閲覧者の記録")
  log.info("閲覧の共有を解除しました", { live: session.id, viewerId })
  return viewers
}

/** LIVE を終了する。閲覧者の共有も外す（記録は残す） */
export async function endLive(session: LiveSession): Promise<void> {
  if (localMode()) {
    updateLocal(session.id, (s) => ({ ...s, status: "ended" }))
    return
  }
  for (const v of session.viewers) {
    try {
      await call(MicrosoftDataverseService.PerformUnboundActionWithOrganization(DATAVERSE_URL, "RevokeAccess", { Target: target(session.id), Revokee: principal(v.id) }), "閲覧の解除")
    } catch (error) {
      log.warn("閲覧の解除に失敗しました（続けます）", { viewer: v.name, error: errorText(error) })
    }
  }
  await patch(session.id, { [col("status")]: "ended" }, "LIVE の終了")
  log.info("LIVE を終了しました", { id: session.id, viewers: session.viewers.length })
}

/** 状態を書き込む（担当者側。呼び出し側で間引く） */
export async function publishState(liveId: string, revision: number, state: LiveState): Promise<void> {
  if (localMode()) {
    updateLocal(liveId, (s) => ({ ...s, revision }), state)
    return
  }
  await patch(liveId, { [col("state")]: JSON.stringify(state), [col("revision")]: revision }, "LIVE の更新")
}

/** 状態を読む（閲覧側） */
export async function readState(liveId: string): Promise<{ revision: number; status: string; state: LiveState | null }> {
  if (localMode()) {
    const s = localSessions().find((x) => x.id === liveId)
    return { revision: s?.revision ?? 0, status: s?.status ?? "", state: localStates()[liveId] ?? null }
  }
  const data = (await call(
    MicrosoftDataverseService.GetItemWithOrganization("return=representation", "application/json", DATAVERSE_URL, ENTITY_LIVE(), liveId, undefined, undefined, [col("state"), col("revision"), col("status")].join(",")),
    "LIVE の取得",
    10000,
  )) as Row | undefined
  const raw = String(data?.[col("state")] ?? "")
  let state: LiveState | null = null
  try {
    state = raw ? (JSON.parse(raw) as LiveState) : null
  } catch {
    state = null
  }
  return { revision: Number(data?.[col("revision")] ?? 0), status: String(data?.[col("status")] ?? ""), state }
}

/** 共有先の利用者を探す（有効な人だけ。アプリ用のユーザーは除く） */
export async function searchUsers(query: string): Promise<Viewer[]> {
  const q = query.replaceAll("'", "''").trim()
  if (q.length < 1) return []
  if (localMode()) return [{ id: "local-viewer", name: `テスト幹部（${q}）`, email: "viewer@example.com" }]
  const data = await call(
    MicrosoftDataverseService.ListRecordsWithOrganization(
      DATAVERSE_URL,
      "systemusers",
      undefined,
      "application/json",
      undefined,
      undefined,
      "systemuserid,fullname,internalemailaddress",
      `isdisabled eq false and accessmode eq 0 and applicationid eq null and (contains(fullname,'${q}') or contains(internalemailaddress,'${q}'))`,
      "fullname asc",
      undefined,
      undefined,
      15,
    ),
    "利用者の検索",
  )
  return (((data as { value?: Row[] } | undefined)?.value ?? []) as Row[]).map((r) => ({ id: String(r.systemuserid), name: String(r.fullname ?? ""), email: String(r.internalemailaddress ?? "") }))
}

// ---- テスト用ビルド: 同じブラウザの別タブで閲覧を確かめるため、localStorage を LIVE レコードの代わりにする ----
const LOCAL_KEY = "agm-live-local"
function localSessions(): LiveSession[] {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}").sessions ?? []) as LiveSession[]
  } catch {
    return []
  }
}
function localStates(): Record<string, LiveState> {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}").states ?? {}) as Record<string, LiveState>
  } catch {
    return {}
  }
}
function saveLocal(sessions: LiveSession[], states: Record<string, LiveState>) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ sessions, states }))
}
function updateLocal(id: string, f: (s: LiveSession) => LiveSession, state?: LiveState): LiveSession {
  const sessions = localSessions().map((s) => (s.id === id ? f({ ...s, modifiedOn: new Date().toISOString() }) : s))
  const states = localStates()
  if (state) states[id] = state
  saveLocal(sessions, states)
  return sessions.find((s) => s.id === id)!
}