// 文字起こしの精度比較: Azure Speech（リアルタイム）・Azure Speech（Fast Transcription）・MAI-Transcribe（1.5 / 2）を
// 同じ音声で動かし、台本（正解）との文字誤り率（CER）・株主番号・数値の一致・処理時間を比べる。
// アプリの比較モードと同じく「リアルタイムの確定文ごとに、その区間の音声を MAI で再認識」も測る。
//
// 使い方（.env の値を使う。トークンは az のサインインから取る）:
//   powershell -File scripts/test/make_rehearsal_audio.ps1 -Out .mcp/tts/rehearsal25.wav
//   node scripts/test/compare-stt.mjs --wav .mcp/tts/rehearsal25.wav --script data/demo/rehearsal-script.json [--speed 2] [--out spec/eval/stt-compare.json]
// 必要な .env: SPEECH_RESOURCE_NAME（リアルタイム・Fast の比較元）/ AZURE_LOCATION / MAI_SPEECH_RESOURCE_NAME（MAI を呼べるリージョンの Foundry リソース）
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(path.join(process.cwd(), "package.json"))
const sdk = require("microsoft-cognitiveservices-speech-sdk")
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
)
const need = (k) => env[k] || process.env[k] || (() => { throw new Error(`.env に ${k} がありません`) })()
const speechName = need("SPEECH_RESOURCE_NAME")
const region = env.AZURE_LOCATION || "japaneast"
const maiName = need("MAI_SPEECH_RESOURCE_NAME")
const wavPath = arg("wav", ".mcp/tts/rehearsal25.wav")
const scriptPath = arg("script", "data/demo/rehearsal-script.json")
const speed = Number(arg("speed", "2"))
const models = arg("models", "MAI-Transcribe-2,MAI-Transcribe-1.5").split(",")
const out = arg("out", "")
const API = "speechtotext/transcriptions:transcribe?api-version=2025-10-15"
// MAI はキーワードの一覧に上限がある（実測: 200 件で「Context list cannot have more than 200 items」）
const MAI_PHRASE_LIMIT = 100

const entra = execSync("az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv", { encoding: "utf8" }).trim()
const resourceId = execSync(`az cognitiveservices account show -n ${speechName} -g ${need("AZURE_RESOURCE_GROUP")} --query id -o tsv`, { encoding: "utf8" }).trim()
const speechToken = `aad#${resourceId}#${entra}`

// ── 正解と指標 ──
const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"))
const reference = script.lines.map((l) => l.text).join("")
const holderNumbers = script.lines.filter((l) => l.role === "shareholder" && l.number && !l.note).map((l) => l.number)
const keywordsSource = JSON.parse(fs.readFileSync("data/demo/qa-master.json", "utf8"))
const phrases = ["株主番号", ...new Set(keywordsSource.flatMap((q) => q.keywords ?? []))].slice(0, 400)
const norm = (s) => s.normalize("NFKC").replace(/[\s、。，．・「」『』（）()？！?!,.:：;；"'“”‘’…ー－-]/g, "")
function cer(ref, hyp) {
  const a = [...norm(ref)]
  const b = [...norm(hyp)]
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return +(prev[b.length] / a.length).toFixed(4)
}
const claimRe = /\d+(?:\.\d+)?\s*(?:億円|百万円|万円|円|%|％|名|株|期|件)/g
const claims = [...new Set(reference.normalize("NFKC").match(claimRe) ?? [])]
function score(hyp, ms, extra = {}) {
  const h = hyp.normalize("NFKC").replace(/\s/g, "")
  return {
    cer: cer(reference, hyp),
    numbers: `${holderNumbers.filter((n) => h.includes(n) || h.includes(String(Number(n)))).length}/${holderNumbers.length}`,
    claims: `${claims.filter((c) => h.includes(c.replace(/\s/g, "").replace("％", "%"))).length}/${claims.length}`,
    ms,
    chars: norm(hyp).length,
    ...extra,
  }
}

// ── 音声 ──
const wav = fs.readFileSync(wavPath)
const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, Math.floor((wav.length - 44) / 2))
const audioSec = pcm.length / 16000
function wavOf(samples) {
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + samples.length * 2, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(samples.length * 2, 40)
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2)])
}

async function fast(resource, audio, enhanced) {
  const definition = { locales: [enhanced ? "ja" : "ja-JP"], phraseList: { phrases: phrases.slice(0, enhanced ? MAI_PHRASE_LIMIT : 500) }, ...(enhanced ? { enhancedMode: { enabled: true, model: enhanced } } : {}) }
  const form = new FormData()
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "audio.wav")
  form.append("definition", JSON.stringify(definition))
  const t0 = performance.now()
  const res = await fetch(`https://${resource}.cognitiveservices.azure.com/${API}`, { method: "POST", headers: { Authorization: `Bearer ${entra}` }, body: form })
  const ms = Math.round(performance.now() - t0)
  const body = await res.json()
  if (!res.ok) throw new Error(`${resource} ${enhanced ?? "fast"}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
  return { text: (body.combinedPhrases ?? []).map((p) => p.text).join(""), ms }
}

async function realtime() {
  const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1))
  const config = sdk.SpeechConfig.fromAuthorizationToken(speechToken, region)
  config.speechRecognitionLanguage = "ja-JP"
  config.setProperty(sdk.PropertyId.WebWorkerLoadType, "off")
  const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromStreamInput(push))
  const list = sdk.PhraseListGrammar.fromRecognizer(recognizer)
  phrases.forEach((p) => list.addPhrase(p))
  const finals = []
  const t0 = performance.now()
  const done = new Promise((resolve) => {
    recognizer.recognized = (_s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text)
        finals.push({ text: e.result.text, offsetMs: e.result.offset / 1e4, durationMs: e.result.duration / 1e4, atMs: Math.round(performance.now() - t0) })
    }
    recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) console.error(`認識がエラーで中断: ${e.errorDetails}`)
      resolve()
    }
    recognizer.sessionStopped = () => resolve()
  })
  recognizer.startContinuousRecognitionAsync()
  const chunk = 1600 // 100 ms
  for (let i = 0; i < pcm.length; i += chunk) {
    push.write(pcm.slice(i, i + chunk).buffer)
    await new Promise((r) => setTimeout(r, 100 / speed))
  }
  push.close()
  await done
  recognizer.close()
  // 確定までの遅れ: 確定した時刻 − 発話の終わり（音声上の位置を送信速度で割る）
  const lags = finals.map((f) => f.atMs - (f.offsetMs + f.durationMs) / speed).sort((a, b) => a - b)
  return { finals, ms: Math.round(performance.now() - t0), lagP50: Math.round(lags[Math.floor(lags.length / 2)] ?? 0) }
}

async function perPhrase(model, finals) {
  const pad = 3200 // 前後 200 ms
  const results = new Array(finals.length)
  const lat = []
  let next = 0
  async function worker() {
    while (next < finals.length) {
      const i = next++
      const f = finals[i]
      const from = Math.max(0, Math.round((f.offsetMs / 1000) * 16000) - pad)
      const to = Math.min(pcm.length, Math.round(((f.offsetMs + f.durationMs) / 1000) * 16000) + pad)
      const r = await fast(maiName, wavOf(pcm.subarray(from, to)), model).catch((e) => ({ text: "", ms: 0, error: String(e) }))
      results[i] = r.text
      lat.push(r.ms)
    }
  }
  const t0 = performance.now()
  await Promise.all([worker(), worker(), worker()])
  lat.sort((a, b) => a - b)
  return { text: results.join(""), ms: Math.round(performance.now() - t0), p50: lat[Math.floor(lat.length / 2)], p95: lat[Math.floor(lat.length * 0.95)], lines: results }
}

console.log(`音声 ${audioSec.toFixed(1)} 秒 / 正解 ${norm(reference).length} 文字 / 株主番号 ${holderNumbers.join(",")} / 数値 ${claims.length} 個`)
const rows = {}
const rt = await realtime()
rows["Azure Speech（リアルタイム）"] = score(rt.finals.map((f) => f.text).join(""), rt.ms, { note: `確定 ${rt.finals.length} 文・確定の遅れ中央値 ${rt.lagP50} ms（${speed} 倍速で送信）` })
const fastRes = await fast(speechName, wav, null)
rows["Azure Speech（Fast・ファイル）"] = score(fastRes.text, fastRes.ms)
const texts = { realtime: rt.finals.map((f) => f.text) }
for (const model of models) {
  const whole = await fast(maiName, wav, model)
  rows[`${model}（ファイル全体）`] = score(whole.text, whole.ms)
  const pp = await perPhrase(model, rt.finals)
  rows[`${model}（確定文ごとに再認識）`] = score(pp.text, pp.ms, { note: `1 文の応答 p50 ${pp.p50} ms / p95 ${pp.p95} ms` })
  texts[model] = pp.lines
}
console.table(rows)
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const lines = rt.finals.map((f, i) => ({ offsetMs: Math.round(f.offsetMs), azure: f.text, ...Object.fromEntries(models.map((m) => [m, texts[m][i]])) }))
  fs.writeFileSync(out, JSON.stringify({ audioSec, referenceChars: norm(reference).length, rows, lines }, null, 2))
  console.log(`書き出しました: ${out}`)
}
