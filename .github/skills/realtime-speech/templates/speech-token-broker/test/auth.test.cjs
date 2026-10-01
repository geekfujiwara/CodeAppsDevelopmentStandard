const test = require("node:test")
const assert = require("node:assert/strict")
const { hasScope, verifyRequest, authorizeClaims, parseList } = require("../dist/src/lib/auth.js")

const apiAppId = "11111111-1111-1111-1111-111111111111"
const exp = Math.floor(Date.now() / 1000) + 600

test("hasScope は scp に必要なスコープがあるときだけ true", () => {
  assert.equal(hasScope({ scp: "Speech.Token offline_access" }, "Speech.Token"), true)
  assert.equal(hasScope({ scp: "Other.Scope" }, "Speech.Token"), false)
  assert.equal(hasScope({ roles: ["Speech.Token"] }, "Speech.Token"), false)
})

test("Bearer が無い要求は拒否する", async () => {
  const result = await verifyRequest(null)
  assert.equal(result.ok, false)
})

test("CLI などの委任トークン（scp に公開スコープ）は許可する", () => {
  const claims = { ver: "1.0", exp, oid: "u", scp: "Speech.Token", appid: "04b07795-8ddb-461a-bbee-02f9e1bf7b46" }
  assert.equal(authorizeClaims(claims, "Speech.Token", [apiAppId]), null)
})

test("カスタム コネクタの v1 トークン（client = resource、scp は User.Read）は信頼クライアントとして許可する", () => {
  // 実測したクレームの形（2026-10）
  const claims = { ver: "1.0", exp, oid: "u", aud: apiAppId, scp: "User.Read", appid: apiAppId }
  assert.equal(authorizeClaims(claims, "Speech.Token", [apiAppId]), null)
})

test("公開スコープが無く信頼されていないクライアントは拒否する", () => {
  const claims = { ver: "1.0", exp, oid: "u", aud: apiAppId, scp: "User.Read", appid: "22222222-2222-2222-2222-222222222222" }
  assert.match(authorizeClaims(claims, "Speech.Token", [apiAppId]), /untrusted client/)
})

test("アプリ専用トークン（scp なし）は信頼クライアントでも拒否する", () => {
  const claims = { ver: "1.0", exp, oid: "u", roles: ["x"], appid: apiAppId }
  assert.equal(authorizeClaims(claims, "Speech.Token", [apiAppId]), "app-only token (no scp)")
})

test("oid の無いトークンは拒否する", () => {
  const claims = { ver: "1.0", exp, scp: "Speech.Token", appid: apiAppId }
  assert.equal(authorizeClaims(claims, "Speech.Token", [apiAppId]), "token without oid")
})

test("TRUSTED_CLIENT_IDS はカンマ区切りで空要素を除く", () => {
  assert.deepEqual(parseList(" a, b ,,c "), ["a", "b", "c"])
})
