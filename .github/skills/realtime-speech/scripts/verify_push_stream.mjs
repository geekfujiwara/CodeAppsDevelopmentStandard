// ブラウザと同じ経路（48 kHz Float32 → downsampleToPcm16 → Push ストリーム）を端末で検証する。
// 変換関数はテンプレートの audio-pipeline.ts をそのまま import する（Node 22.18 以降 / 24 の型除去を使う）。
// Speech SDK を入れたプロジェクトのフォルダーで実行する:
//   $env:SPEECH_TOKEN = (powershell -File .github/skills/realtime-speech/scripts/get_speech_token.ps1 -Raw)
//   node .github/skills/realtime-speech/scripts/verify_push_stream.mjs --wav samples/question.wav
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const require = createRequire(path.join(process.cwd(), "package.json"))
const sdk = require("microsoft-cognitiveservices-speech-sdk")
const here = path.dirname(fileURLToPath(import.meta.url))
const { downsampleToPcm16 } = await import(
  pathToFileURL(path.join(here, "..", "templates", "code-apps-addon", "src", "lib", "speech", "audio-pipeline.ts")).href
)

const args = process.argv.slice(2)
const wavPath = args[args.indexOf("--wav") + 1]
const token = process.env.SPEECH_TOKEN
const region = process.env.SPEECH_REGION ?? "japaneast"
if (!token || args.indexOf("--wav") < 0) {
  console.error("SPEECH_TOKEN と --wav <16kHz/16bit/mono の WAV> が必要です")
  process.exit(1)
}

const wav = fs.readFileSync(wavPath)
const pcm16k = new Int16Array(wav.buffer, wav.byteOffset + 44, Math.floor((wav.length - 44) / 2))
// マイク相当の 48 kHz Float32 に線形補間で戻す
const upRate = 48000
const up = new Float32Array(pcm16k.length * 3)
for (let i = 0; i < up.length; i++) {
  const pos = i / 3
  const a = pcm16k[Math.floor(pos)] ?? 0
  const b = pcm16k[Math.min(pcm16k.length - 1, Math.floor(pos) + 1)] ?? 0
  up[i] = (a + (b - a) * (pos - Math.floor(pos))) / 32768
}

const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1))
const config = sdk.SpeechConfig.fromAuthorizationToken(token, region)
config.speechRecognitionLanguage = "ja-JP"
config.setProperty(sdk.PropertyId.WebWorkerLoadType, "off")
const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromStreamInput(push))
const finals = []
let partials = 0
const done = new Promise((resolve) => {
  recognizer.recognizing = () => (partials += 1)
  recognizer.recognized = (_s, e) => e.result.reason === sdk.ResultReason.RecognizedSpeech && finals.push(e.result.text)
  recognizer.canceled = (_s, e) => {
    if (e.reason === sdk.CancellationReason.Error) console.error(`認識がエラーで中断: ${e.errorDetails}`)
    resolve()
  }
  recognizer.sessionStopped = () => resolve()
})
recognizer.startContinuousRecognitionAsync()

// AudioWorklet と同じく 2048 フレーム単位・実時間で流す
const frame = 2048
const frameMs = (frame / upRate) * 1000
for (let offset = 0; offset < up.length; offset += frame) {
  push.write(downsampleToPcm16(up.subarray(offset, offset + frame), upRate).buffer)
  await new Promise((r) => setTimeout(r, frameMs))
}
push.close()
await done
recognizer.close()

console.log(`途中結果 ${partials} 回 / 確定文 ${finals.length} 件`)
finals.forEach((f) => console.log(`  ${f}`))
process.exit(finals.length > 0 ? 0 : 1)
