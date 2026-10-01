import jwt, { type JwtHeader, type JwtPayload, type SigningKeyCallback } from "jsonwebtoken"
import jwksClient from "jwks-rsa"

// スキャフォルダーの変数置換（大文字スネークケース）と衝突しないよう、テンプレート リテラル内の識別子は camelCase にする
const tenantId = process.env.ENTRA_TENANT_ID ?? ""
const audience = process.env.API_AUDIENCE ?? "" // api://{app-id}
const requiredScope = process.env.REQUIRED_SCOPE ?? "Speech.Token"
// 公開スコープが無くても受け付けるクライアント（カンマ区切り）。既定は API アプリ自身（= カスタム コネクタ）
const trustedClientIds = parseList(process.env.TRUSTED_CLIENT_IDS ?? audience.replace(/^api:\/\//, ""))

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
})

function getKey(header: JwtHeader, cb: SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => cb(err, key?.getPublicKey()))
}

export type Caller = { oid: string; upn?: string; appId?: string }
export type AuthResult = { ok: true; caller: Caller } | { ok: false; reason: string }

export function parseList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean)
}

export function hasScope(payload: JwtPayload, required: string): boolean {
  const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : []
  return scopes.includes(required)
}

/**
 * 署名・audience・発行元を検証した後のクレームで認可を判定する。拒否理由を返し、許可なら null。
 *
 * - 利用者の委任トークンだけを受け付ける（アプリ専用トークンは scp を持たない）
 * - scp に公開スコープがあれば許可（CLI などクライアントと API が別アプリの場合）
 * - カスタム コネクタは API アプリ自身をクライアントにして v1 トークンを取る（client = resource）。
 *   その場合 scp には公開スコープではなく Graph の委任スコープ（例: User.Read）が入るため、
 *   信頼するクライアント（既定は API アプリ自身。シークレットを持つコネクタだけが取得できる）なら許可する
 */
export function authorizeClaims(payload: JwtPayload, scope: string, trusted: string[]): string | null {
  if (typeof payload.exp !== "number") return "token without exp"
  if (typeof payload.scp !== "string" || !payload.scp) return "app-only token (no scp)"
  if (typeof payload.oid !== "string") return "token without oid"
  const clientAppId = (payload.azp ?? payload.appid) as string | undefined
  if (hasScope(payload, scope) || (clientAppId !== undefined && trusted.includes(clientAppId))) return null
  // 秘密ではないクレームだけを返し、どのクライアントがどの形式のトークンを送ったかをログで判別できるようにする
  return `missing scope ${scope} and untrusted client ${JSON.stringify({ ver: payload.ver, aud: payload.aud, scp: payload.scp, appid: clientAppId })}`
}

export async function verifyRequest(authorization: string | null): Promise<AuthResult> {
  if (!tenantId || !audience) return { ok: false, reason: "server not configured" }
  if (!authorization?.startsWith("Bearer ")) return { ok: false, reason: "missing bearer token" }
  const token = authorization.slice("Bearer ".length)

  const payload = await new Promise<JwtPayload | undefined>((resolve) => {
    jwt.verify(
      token,
      getKey,
      {
        // aud は api:// 付きと GUID のみ（v1 トークン）の両方があり得る
        audience: [audience, audience.replace(/^api:\/\//, "")],
        issuer: [`https://login.microsoftonline.com/${tenantId}/v2.0`, `https://sts.windows.net/${tenantId}/`],
        algorithms: ["RS256"],
        clockTolerance: 60,
      },
      (err, decoded) => resolve(err || typeof decoded !== "object" ? undefined : (decoded as JwtPayload)),
    )
  })

  if (!payload) return { ok: false, reason: "invalid token" }
  const rejected = authorizeClaims(payload, requiredScope, trustedClientIds)
  if (rejected) return { ok: false, reason: rejected }

  return {
    ok: true,
    caller: {
      oid: payload.oid as string,
      upn: (payload.preferred_username ?? payload.upn) as string | undefined,
      appId: (payload.azp ?? payload.appid) as string | undefined,
    },
  }
}
