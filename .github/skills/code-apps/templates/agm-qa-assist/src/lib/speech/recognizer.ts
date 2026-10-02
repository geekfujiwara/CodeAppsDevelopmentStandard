import * as sdk from "microsoft-cognitiveservices-speech-sdk"
import { createLogger } from "@/lib/debug-log"
import { inspectToken } from "@/lib/speech/token"

export type RecognizerOptions = {
  language?: string
  // 社名・製品名・専門用語など、聞き取りを優先させたい語句
  phrases?: string[]
  // 発話の区切りとみなす無音の長さ（ms）。短いほど確定が早いが、文が細切れになる
  segmentationSilenceMs?: number
}

export function createRecognizer(audioConfig: sdk.AudioConfig, token: string, region: string, label: string, options: RecognizerOptions = {}) {
  const scoped = createLogger(`speech:${label}`)
  scoped.info("認識器を作成", { region, token: inspectToken(token).message })
  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region)
  speechConfig.speechRecognitionLanguage = options.language ?? "ja-JP"
  speechConfig.setProperty(sdk.PropertyId.SpeechServiceResponse_StablePartialResultThreshold, "2")
  speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, String(options.segmentationSilenceMs ?? 800))
  // 必須: SDK は送信の待ち合わせに data: URL の Worker タイマーを使うが、Code Apps の既定 CSP（worker-src）で読み込めず、
  // 送信が詰まった瞬間にタイマーが発火しないまま文字起こしが無言で止まる。window.setTimeout を使わせる
  speechConfig.setProperty(sdk.PropertyId.WebWorkerLoadType, "off")
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)
  if (options.phrases?.length) {
    const phraseList = sdk.PhraseListGrammar.fromRecognizer(recognizer)
    options.phrases.forEach((p) => phraseList.addPhrase(p))
  }

  const connection = sdk.Connection.fromRecognizer(recognizer)
  connection.connected = (e) => scoped.info("WebSocket 接続確立", { sessionId: e.sessionId })
  connection.disconnected = (e) => scoped.warn("WebSocket 切断", { sessionId: e.sessionId })
  connection.messageReceived = (e) => {
    const body = e.message.isTextMessage ? e.message.TextMessage : `(binary ${e.message.binaryMessage?.byteLength ?? 0} bytes)`
    scoped.debug(`受信 ${e.message.path}`, body.length > 300 ? `${body.slice(0, 300)}…` : body)
  }
  connection.messageSent = (e) => {
    if (e.message.path !== "audio") scoped.debug(`送信 ${e.message.path}`)
  }

  recognizer.sessionStarted = (_s, e) => scoped.info("セッション開始", { sessionId: e.sessionId })
  recognizer.sessionStopped = (_s, e) => scoped.info("セッション終了", { sessionId: e.sessionId })
  recognizer.speechStartDetected = (_s, e) => scoped.info("発話開始を検知", { offset: e.offset })
  recognizer.speechEndDetected = (_s, e) => scoped.info("発話終了を検知", { offset: e.offset })
  return { recognizer, connection, scoped }
}
