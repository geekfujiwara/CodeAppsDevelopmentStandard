import { DefaultAzureCredential } from "@azure/identity"

// スキャフォルダーの変数置換（大文字スネークケース）と衝突しないよう、テンプレート リテラル内の識別子は camelCase にする
const speechEndpoint = (process.env.SPEECH_ENDPOINT ?? "").replace(/\/+$/, "")
export const speechRegion = process.env.SPEECH_REGION ?? ""

// STS トークンの寿命は 10 分。余裕を持って 9 分で失効扱いにし、60 秒前から再発行する
const tokenLifetimeMs = 9 * 60 * 1000
const refreshMarginMs = 60 * 1000

const credential = new DefaultAzureCredential()
let cached: { token: string; expiresAt: number } | undefined
let inflight: Promise<{ token: string; expiresAt: number }> | undefined

async function issue(): Promise<{ token: string; expiresAt: number }> {
  if (!speechEndpoint) throw new Error("SPEECH_ENDPOINT is not configured")
  const entra = await credential.getToken("https://cognitiveservices.azure.com/.default")
  if (!entra) throw new Error("managed identity token unavailable")
  const res = await fetch(`${speechEndpoint}/sts/v1.0/issueToken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${entra.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  })
  if (!res.ok) throw new Error(`issueToken failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return { token: await res.text(), expiresAt: Date.now() + tokenLifetimeMs }
}

export async function getSpeechToken(): Promise<{ token: string; expiresAt: number }> {
  if (cached && Date.now() < cached.expiresAt - refreshMarginMs) return cached
  inflight ??= issue()
    .then((t) => (cached = t))
    .finally(() => (inflight = undefined))
  return inflight
}
