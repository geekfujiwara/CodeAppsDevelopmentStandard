import { createLogger } from "@/lib/debug-log"

// `pa app add data-source` でトークン発行コネクタを追加すると生成されるサービスを遅延解決する。
// 生成ファイル名はコネクタ名に依存するため、GetSpeechToken を持つサービスを探す。
// 静的 import にすると、データソース追加前のビルドが型エラーで失敗する。
const generatedServices = import.meta.glob("../../generated/services/*Service.ts")

const log = createLogger("speech-token")
const refreshMarginMs = 60 * 1000

export type SpeechToken = { token: string; region: string; expiresAt: number }
export type TokenStatus = { valid: boolean; message: string }
type OperationResult<T> = { success?: boolean; data?: T; error?: { message?: string } }
type BrokerResponse = { token: string; region: string; expiresAt: string; expiresInSeconds: number }
type BrokerService = { GetSpeechToken(): Promise<OperationResult<BrokerResponse>> }

let brokerPromise: Promise<BrokerService | undefined> | undefined
let cached: SpeechToken | undefined
let inflight: Promise<SpeechToken> | undefined

export function findTokenBroker(): Promise<BrokerService | undefined> {
  brokerPromise ??= (async () => {
    for (const loader of Object.values(generatedServices)) {
      const mod = (await loader()) as Record<string, unknown>
      const service = Object.values(mod).find((v) => typeof (v as Partial<BrokerService> | undefined)?.GetSpeechToken === "function")
      if (service) return service as BrokerService
    }
    return undefined
  })()
  return brokerPromise
}

async function requestToken(): Promise<SpeechToken> {
  const started = performance.now()
  const service = await findTokenBroker()
  if (!service) throw new Error("トークン発行コネクタがデータソースに追加されていません")
  const result = await service.GetSpeechToken()
  if (!result.success || !result.data?.token) {
    throw new Error(`トークン発行コネクタの呼び出しに失敗: ${result.error?.message ?? "応答にトークンがありません"}`)
  }
  // 端末の時計ずれの影響を避けるため、失効時刻はサーバーが返す残り秒数から計算する
  const token = { token: result.data.token, region: result.data.region, expiresAt: Date.now() + result.data.expiresInSeconds * 1000 }
  log.info("Speech トークンを取得", { region: token.region, expiresInSeconds: result.data.expiresInSeconds, elapsedMs: Math.round(performance.now() - started) })
  return token
}

export async function getSpeechToken(force = false): Promise<SpeechToken> {
  if (!force && cached && Date.now() < cached.expiresAt - refreshMarginMs) return cached
  inflight ??= requestToken()
    .then((t) => (cached = t))
    .finally(() => (inflight = undefined))
  return inflight
}

export function msUntilRefresh(token: SpeechToken): number {
  return Math.max(5_000, token.expiresAt - Date.now() - refreshMarginMs)
}

// 診断用の手動トークン（STS の JWT、または aad#{resourceId}#{entraToken}）の形式と有効期限を確認する
export function inspectToken(token: string): TokenStatus {
  const cleaned = token.trim().replace(/^"|"$/g, "")
  if (!cleaned) return { valid: false, message: "未入力です" }
  const isAad = cleaned.startsWith("aad#")
  const jwt = isAad ? cleaned.slice(cleaned.lastIndexOf("#") + 1) : cleaned
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number }
    if (!payload.exp) return { valid: true, message: "有効期限を読み取れません" }
    const remainingSec = Math.round(payload.exp - Date.now() / 1000)
    const until = new Date(payload.exp * 1000).toLocaleTimeString("ja-JP")
    const kind = isAad ? "Entra ID" : "STS"
    return remainingSec > 0
      ? { valid: true, message: `${kind} トークン / 有効期限 ${until}（残り ${Math.floor(remainingSec / 60)} 分）` }
      : { valid: false, message: `${kind} トークンの期限切れ（${until}）` }
  } catch {
    return { valid: false, message: "トークンの形式が正しくありません" }
  }
}
