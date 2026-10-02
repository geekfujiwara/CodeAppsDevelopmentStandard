// E2E の事前確認。テストの途中で「設定が読めない」「生成が 401」になって原因が分からなくなるのを防ぐ。
// - ビルドに同梱したチケット（dev-ticket.json）が残り minSeconds 以上有効か（チケットは 15 分。開発用ビルドは取り直せない）
// - 配信の CSP（connect-src）がアプリ自身（チケット）と Function を許しているか
// - 配信しているオリジンを Function の CORS が許しているか（許していないポートで配信すると /config と生成が黙って失敗する）
export async function preflight(appUrl, { minSeconds = 300, needTicket = true } = {}) {
  const problems = []
  const origin = new URL(appUrl).origin
  let ticket = null
  try {
    const res = await fetch(new URL("dev-ticket.json", appUrl))
    if (res.ok) ticket = await res.json()
  } catch {
    // 配信が始まっていない場合は下でまとめて報告
  }
  if (!ticket) {
    if (needTicket) problems.push(`${appUrl}dev-ticket.json が読めません。配信を始め、VITE_DEV_ANSWER_TICKET_URL=./dev-ticket.json でビルドしてチケットを dist に置いてください`)
  } else {
    // ホスト再現の配信は Code Apps の既定 CSP（connect-src 'none' + 追加値）を付ける。アプリ自身のチケットと Function を許していないと、生成が Failed to fetch のまま E2E が止まる
    const csp = (await fetch(appUrl).then((r) => r.headers.get("content-security-policy")).catch(() => null)) ?? ""
    const connect = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src")) ?? "").split(/\s+/).slice(1)
    const fnOrigin = ticket.endpoint ? new URL(ticket.endpoint).origin : null
    const lack = [connect.includes("'self'") || connect.includes(origin) ? null : "'self'", fnOrigin && !connect.includes(fnOrigin) ? fnOrigin : null].filter(Boolean)
    if (csp && lack.length) problems.push(`配信の CSP の connect-src に ${lack.join(" と ")} がありません（今: ${connect.join(" ") || "なし"}）。serve_host_emulation.mjs に --connect-src "'self'" ${fnOrigin ?? ""} を足してください`)
    const left = Math.round((Date.parse(ticket.expiresAt) - Date.now()) / 1000)
    if (!(left >= minSeconds)) problems.push(`チケットの残りが ${left} 秒です（${minSeconds} 秒以上必要）。python scripts/test/fetch_answer_ticket.py --out <dist>/dev-ticket.json で取り直してください`)
    if (ticket.endpoint) {
      const fn = new URL(ticket.endpoint).origin
      try {
        const res = await fetch(`${fn}/api/config`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } })
        const allowed = res.headers.get("access-control-allow-origin")
        if (allowed !== origin && allowed !== "*") problems.push(`Function（${fn}）の CORS が ${origin} を許していません。許可済みのポート（例: http://localhost:4173）で配信するか、az functionapp cors add で追加してください`)
      } catch (e) {
        problems.push(`Function（${fn}）に届きません: ${e.message}`)
      }
    }
  }
  if (problems.length) {
    console.error("✖ 事前確認で止めました:\n  - " + problems.join("\n  - "))
    process.exit(2)
  }
  console.log(`✔ 事前確認: チケット ${ticket ? "有効" : "なし"} / CORS ${origin} 許可`)
}
