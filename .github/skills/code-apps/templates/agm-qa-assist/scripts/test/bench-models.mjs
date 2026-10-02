// 回答案の生成モデルを比べる（Function と同じプロンプトで、ストリームの最初の差分までの時間・全体の時間・根拠に無い数値）。
// 実行: $env:AOAI_TOKEN = az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv
//       node scripts/test/bench-models.mjs --endpoint https://<name>.cognitiveservices.azure.com --models gpt-5.4-mini,gpt-5.4-nano --runs 3
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { buildMessages } = require("../../azure/speech-token-broker/dist/src/lib/answer.js")
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const endpoint = arg("endpoint").replace(/\/+$/, "")
const models = arg("models").split(",")
const runs = Number(arg("runs", "3"))
const token = process.env.AOAI_TOKEN
const load = (n) => JSON.parse(readFileSync(new URL(`../../data/demo/${n}.json`, import.meta.url), "utf8"))
const qa = Object.fromEntries(load("qa-master").map((q) => [q.id, q]))
const ir = Object.fromEntries(load("ir-documents").map((d) => [d.id, d]))

const cases = [
  { name: "配当と自社株買い", question: "配当についてですが、来年以降も増配が続くのか、それから自社株買いの20億円というのは配当の代わりなのか、そこを確認したいです。", qa: ["QA-002", "QA-004"], ir: ["IR-003", "IR-011", "IR-001"] },
  { name: "株価（回答制約）", question: "今の株価が割安かどうか、会社としての見解を教えてください。", qa: ["QA-031", "QA-032"], ir: ["IR-001"] },
  { name: "想定問答なし", question: "海外の架空都市ルミナ市に新しい販売子会社を置く予定があるのか教えてください。", qa: [], ir: ["IR-001", "IR-033"] },
]

const numbers = (t) => new Set((t.normalize("NFKC").replaceAll(",", "").match(/\d+(?:\.\d+)?\s*(?:億円|百万円|万円|円|%|ポイント|倍|名|人|件|社|か月|期|株)/g) ?? []).map((s) => s.replace(/\s/g, "")))

async function run(model, c, effort) {
  const req = { mode: "draft", question: c.question, qa: c.qa.map((id) => qa[id]), ir: c.ir.map((id) => ir[id]) }
  const body = { model, messages: buildMessages(req), stream: true, max_completion_tokens: 1200, stream_options: { include_usage: true } }
  if (effort) body.reasoning_effort = effort
  const t0 = performance.now()
  const res = await fetch(`${endpoint}/openai/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 160)}` }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let text = ""
  let first = null
  let usage = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line.startsWith("data:") || line.includes("[DONE]")) continue
      const j = JSON.parse(line.slice(5))
      const d = j.choices?.[0]?.delta?.content
      if (d) {
        first ??= performance.now() - t0
        text += d
      }
      if (j.usage) usage = j.usage
    }
  }
  const source = [...req.qa.map((q) => q.answer), ...req.ir.map((d) => d.text)].join(" ")
  const src = numbers(source)
  return {
    firstMs: Math.round(first ?? -1),
    totalMs: Math.round(performance.now() - t0),
    chars: text.length,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    unknownNumbers: [...numbers(text)].filter((n) => !src.has(n)),
    cites: [...new Set(text.match(/\[(?:QA|IR)-\d+\]/g) ?? [])].length,
    sections: ["【要約】", "【回答案】", "【補足・注意】"].every((s) => text.includes(s)),
    text,
  }
}

const results = []
for (const model of models) {
  // 推論の深さは最小から試し、受け付けない値は次へ
  let effort = null
  for (const e of ["none", "minimal", "low", null]) {
    const probe = await run(model, cases[0], e)
    if (!probe.error) {
      effort = e
      break
    }
    console.log(`${model} reasoning_effort=${e}: ${probe.error}`)
  }
  for (const c of cases) {
    for (let r = 0; r < runs; r++) {
      const out = await run(model, c, effort)
      results.push({ model, effort, case: c.name, ...out })
      if (r === 0 && c === cases[0]) console.log(`\n===== ${model}（${effort}）=====\n${out.text}\n`)
    }
  }
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
console.table(
  models.map((m) => {
    const rs = results.filter((r) => r.model === m && !r.error)
    return {
      model: m,
      effort: rs[0]?.effort,
      firstMs_p50: median(rs.map((r) => r.firstMs)),
      firstMs_max: Math.max(...rs.map((r) => r.firstMs)),
      totalMs_p50: median(rs.map((r) => r.totalMs)),
      reasoningTok: median(rs.map((r) => r.reasoningTokens)),
      unknownNumbers: rs.reduce((s, r) => s + r.unknownNumbers.length, 0),
      formatOk: `${rs.filter((r) => r.sections).length}/${rs.length}`,
      citesAvg: (rs.reduce((s, r) => s + r.cites, 0) / rs.length).toFixed(1),
    }
  }),
)
for (const r of results.filter((x) => x.unknownNumbers.length)) console.log(`根拠に無い数値: ${r.model} / ${r.case}: ${r.unknownNumbers.join(", ")}`)
const novel = results.filter((r) => r.case === "想定問答なし")
for (const m of models) console.log(`\n--- ${m}: 想定問答なし ---\n${novel.find((r) => r.model === m)?.text ?? ""}`)
