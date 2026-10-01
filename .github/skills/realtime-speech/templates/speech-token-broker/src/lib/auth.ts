import jwt, { type JwtHeader, type JwtPayload, type SigningKeyCallback } from "jsonwebtoken"
import jwksClient from "jwks-rsa"

const tenantId = process.env.ENTRA_TENANT_ID ?? ""
const audience = process.env.API_AUDIENCE ?? "" // api://{app-id}
const requiredScope = process.env.REQUIRED_SCOPE ?? "Speech.Token"

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

export function hasScope(payload: JwtPayload, required: string): boolean {
  const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : []
  return scopes.includes(required)
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
        // aud は api:// 付きと GUID のみの両方があり得る
        audience: [audience, audience.replace(/^api:\/\//, "")],
        issuer: [`https://login.microsoftonline.com/${tenantId}/v2.0`, `https://sts.windows.net/${tenantId}/`],
        algorithms: ["RS256"],
        clockTolerance: 60,
      },
      (err, decoded) => resolve(err || typeof decoded !== "object" ? undefined : (decoded as JwtPayload)),
    )
  })

  if (!payload) return { ok: false, reason: "invalid token" }
  if (typeof payload.exp !== "number") return { ok: false, reason: "token without exp" }
  // 利用者の委任トークンだけを受け付ける（アプリ専用トークンは scp を持たない）
  if (!hasScope(payload, requiredScope)) return { ok: false, reason: `missing scope ${requiredScope}` }
  if (typeof payload.oid !== "string") return { ok: false, reason: "token without oid" }

  return {
    ok: true,
    caller: {
      oid: payload.oid,
      upn: (payload.preferred_username ?? payload.upn) as string | undefined,
      appId: (payload.azp ?? payload.appid) as string | undefined,
    },
  }
}
