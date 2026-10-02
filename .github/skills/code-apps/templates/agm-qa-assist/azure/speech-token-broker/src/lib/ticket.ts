import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * ブラウザから生成 API（ストリーム）を直接呼ぶための短期チケット。
 * カスタム コネクタは応答をまとめて返すためストリームを中継できない。そこで、コネクタ経由（利用者の委任トークンで認証済み）で
 * チケットを発行し、ブラウザはそのチケットで Function のストリーム API を fetch する。
 * 形式: base64url(JSON).base64url(HMAC-SHA256)。署名鍵は Function のアプリ設定 TICKET_SECRET（Git に置かない）。
 */
export interface TicketClaims {
  oid: string
  upn?: string
  aud: "agm-answer"
  exp: number
  jti: string
}

const AUDIENCE = "agm-answer"
export const TICKET_LIFETIME_SECONDS = 15 * 60

const b64url = (buf: Buffer) => buf.toString("base64url")

function secret(): Buffer {
  const raw = process.env.TICKET_SECRET ?? ""
  const key = Buffer.from(raw, "base64")
  if (key.length < 32) throw new Error("TICKET_SECRET is not configured (base64, 32 bytes or more)")
  return key
}

export function issueTicket(oid: string, upn: string | undefined, now = Date.now(), key = secret()): { ticket: string; claims: TicketClaims } {
  const claims: TicketClaims = { oid, upn, aud: AUDIENCE, exp: Math.floor(now / 1000) + TICKET_LIFETIME_SECONDS, jti: b64url(randomBytes(9)) }
  const body = b64url(Buffer.from(JSON.stringify(claims)))
  const sig = b64url(createHmac("sha256", key).update(body).digest())
  return { ticket: `${body}.${sig}`, claims }
}

export function verifyTicket(header: string | null, now = Date.now(), key = secret()): { ok: true; claims: TicketClaims } | { ok: false; reason: string } {
  const value = (header ?? "").replace(/^Ticket\s+/i, "").trim()
  const [body, sig, extra] = value.split(".")
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed ticket" }
  const expected = createHmac("sha256", key).update(body).digest()
  const given = Buffer.from(sig, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad signature" }
  let claims: TicketClaims
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "malformed claims" }
  }
  if (claims.aud !== AUDIENCE) return { ok: false, reason: "wrong audience" }
  if (!claims.oid) return { ok: false, reason: "no caller" }
  if (claims.exp * 1000 <= now) return { ok: false, reason: "expired" }
  return { ok: true, claims }
}
