// アプリの設定（文字起こしの接続先・回答案と株主照合の AI モデル）。
// 効く値 = アプリの初期値 ← 組織の既定（Dataverse の設定テーブル name=default）← この端末だけの変更（localStorage）。
// 選べる値は Function の /config（許可リスト）から取る。React 以外（生成・照合の呼び出し）からも currentSettings() で読む。
import { useSyncExternalStore } from "react"
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, col } from "./config"
import { errorText, withTimeout } from "./corpus"
import { getAnswerTicket } from "./generate"
import { MicrosoftDataverseService } from "./services"
import { mergeSettings, sanitize, type AppSettings, type RemoteConfig, type SettingsPatch } from "./settings-core"
export * from "./settings-core"

const log = createLogger("settings")
const LOCAL_KEY = "agm-settings-local"
const ORG_LOCAL_KEY = "agm-settings-org-local"
const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"

interface State {
  org: SettingsPatch
  local: SettingsPatch
  orgId?: string
  orgLoaded: boolean
  orgError?: string
  config?: RemoteConfig
  configError?: string
}

let state: State = { org: {}, local: readLocal(LOCAL_KEY), orgLoaded: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  cached = null
  emit()
}

function readLocal(key: string): SettingsPatch {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as SettingsPatch
  } catch {
    return {}
  }
}

let cached: AppSettings | null = null
/** いま効いている設定（生成・照合・文字起こしの呼び出しで使う） */
export function currentSettings(): AppSettings {
  cached ??= sanitize(mergeSettings(state.org, state.local), state.config)
  return cached
}

export function useSettings() {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  return { ...snapshot, settings: currentSettings() }
}

const settingId = () => `${ENTITY.setting.slice(0, -1)}id`

/** 組織の既定と、選べる値（/config）を読む。アプリの起動時に 1 回 */
export async function loadSettings(): Promise<void> {
  const [org, config] = await Promise.allSettled([readOrg(), fetchConfig()])
  set({
    org: org.status === "fulfilled" ? org.value.patch : {},
    orgId: org.status === "fulfilled" ? org.value.id : undefined,
    orgLoaded: true,
    orgError: org.status === "rejected" ? errorText(org.reason) : undefined,
    config: config.status === "fulfilled" ? config.value : undefined,
    configError: config.status === "rejected" ? errorText(config.reason) : undefined,
  })
  log.info("設定を読み込みました", { org: org.status, config: config.status, effective: currentSettings() })
}

async function readOrg(): Promise<{ id?: string; patch: SettingsPatch }> {
  if (localMode()) return { patch: readLocal(ORG_LOCAL_KEY) }
  const result = await withTimeout(
    MicrosoftDataverseService.ListRecordsWithOrganization(DATAVERSE_URL, ENTITY.setting, undefined, "application/json", undefined, undefined, [settingId(), col("value")].join(","), `${col("name")} eq 'default'`, undefined, undefined, undefined, 1),
    15000,
    "設定の取得",
  )
  if (!result.success) throw new Error(`設定を読めません: ${errorText(result.error)}`)
  const row = ((result.data as { value?: Record<string, unknown>[] } | undefined)?.value ?? [])[0]
  if (!row) return { patch: {} }
  try {
    return { id: String(row[settingId()]), patch: JSON.parse(String(row[col("value")] ?? "{}")) as SettingsPatch }
  } catch {
    return { id: String(row[settingId()]), patch: {} }
  }
}

async function fetchConfig(): Promise<RemoteConfig> {
  const ticket = await getAnswerTicket()
  const res = await withTimeout(fetch(ticket.endpoint.replace(/\/answer\/stream$/, "/config"), { headers: { Authorization: `Ticket ${ticket.ticket}` } }), 15000, "設定の選択肢の取得")
  if (!res.ok) throw new Error(`設定の選択肢を取得できません（${res.status}）`)
  return (await res.json()) as RemoteConfig
}

/** この端末だけで試す（ブラウザに保存。組織の既定より優先） */
export function setLocalSettings(patch: SettingsPatch) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(patch))
  set({ local: patch })
  log.info("この端末の設定を変更しました", patch)
}

export function clearLocalSettings() {
  localStorage.removeItem(LOCAL_KEY)
  set({ local: {} })
}

/** 組織の既定にする（Dataverse の設定に保存。オペレーターのロールが必要）。この端末だけの変更は消す */
export async function saveOrgDefault(settings: AppSettings): Promise<void> {
  const value = JSON.stringify(settings)
  if (localMode()) {
    localStorage.setItem(ORG_LOCAL_KEY, value)
  } else if (state.orgId) {
    const r = await withTimeout(MicrosoftDataverseService.UpdateRecordWithOrganization("return=minimal", "application/json", DATAVERSE_URL, ENTITY.setting, state.orgId, { [col("value")]: value }), 20000, "既定の保存")
    if (!r.success) throw new Error(`既定を保存できません: ${errorText(r.error)}`)
  } else {
    const r = await withTimeout(MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", DATAVERSE_URL, ENTITY.setting, { [col("name")]: "default", [col("value")]: value }), 20000, "既定の保存")
    if (!r.success) throw new Error(`既定を保存できません: ${errorText(r.error)}`)
    const row = (r.data as unknown as Record<string, unknown>) ?? {}
    set({ orgId: String(row[settingId()] ?? "") || undefined })
  }
  localStorage.removeItem(LOCAL_KEY)
  set({ org: JSON.parse(value) as SettingsPatch, local: {} })
  log.info("組織の既定を保存しました", settings)
}
