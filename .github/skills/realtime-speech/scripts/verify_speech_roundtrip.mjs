// 端末から Speech の往復を検証する: 音声合成で質問音声（WAV）を作り、同じトークンでストリーミング認識する。
// 作った WAV はホスト再現テストの疑似マイクにも使える。
// Speech SDK を入れたプロジェクトのフォルダーで実行する（SDK は実行時のカレント フォルダーから解決する）。
// トークンは STS 形式でも aad# 形式でもよい:
//   $env:SPEECH_TOKEN = (powershell -File .github/skills/realtime-speech/scripts/get_speech_token.ps1 -Raw)
//   node .github/skills/realtime-speech/scripts/verify_speech_roundtrip.mjs --out samples/question.wav [--text "..."] [--phrase 語句 ...]
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(path.join(process.cwd(), "package.json"))
const sdk = require("microsoft-cognitiveservices-speech-sdk")

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const phrases = args.flatMap((a, i) => (a === "--phrase" ? [args[i + 1]] : []))
const token = process.env.SPEECH_TOKEN
const region = process.env.SPEECH_REGION ?? opt("--region", "japaneast")
const out = opt("--out", "samples/speech-roundtrip.wav")
const voice = opt("--voice", "ja-JP-KeitaNeural")
const text = opt(
  "--text",
  "株主番号1234の山田です。今期の配当について伺います。配当性向を40パーセントに引き上げる方針と伺いましたが、来期以降も増配は継続されるのでしょうか。",
)
if (!token) {
  console.error("SPEECH_TOKEN が未設定です（get_speech_token.ps1 -Raw の出力を設定する）")
  process.exit(1)
}

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c])
const ttsStart = performance.now()
const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
    "User-Agent": "realtime-speech-verify",
  },
  body: `<speak version="1.0" xml:lang="ja-JP"><voice name="${voice}">${escapeXml(text)}</voice></speak>`,
})
if (!res.ok) {
  console.error(`音声合成に失敗: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const wav = Buffer.from(await res.arrayBuffer())
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, wav)
console.log(`音声合成 OK: ${out}（${(wav.length / 1024).toFixed(0)} KB、${Math.round(performance.now() - ttsStart)} ms）`)

const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region)
speechConfig.speechRecognitionLanguage = "ja-JP"
speechConfig.setProperty(sdk.PropertyId.SpeechServiceResponse_StablePartialResultThreshold, "2")
const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromWavFileInput(wav))
if (phrases.length) {
  const list = sdk.PhraseListGrammar.fromRecognizer(recognizer)
  phrases.forEach((p) => list.addPhrase(p))
}

const started = performance.now()
let partials = 0
let firstPartial = null
const finals = []
await new Promise((resolve) => {
  recognizer.recognizing = () => {
    partials += 1
    firstPartial ??= Math.round(performance.now() - started)
  }
  recognizer.recognized = (_s, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) finals.push(e.result.text)
  }
  recognizer.canceled = (_s, e) => {
    if (e.reason === sdk.CancellationReason.Error) console.error(`認識がエラーで中断: ${e.errorDetails}`)
    resolve()
  }
  recognizer.sessionStopped = () => resolve()
  recognizer.startContinuousRecognitionAsync()
})
recognizer.close()

console.log(`途中結果 ${partials} 回 / 最初の途中結果 ${firstPartial} ms / 全体 ${Math.round(performance.now() - started)} ms`)
finals.forEach((f) => console.log(`  ${f}`))
process.exit(finals.length > 0 ? 0 : 1)
