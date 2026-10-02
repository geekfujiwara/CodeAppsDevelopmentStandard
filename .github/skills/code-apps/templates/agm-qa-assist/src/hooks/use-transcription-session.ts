import { useCallback, useEffect, useRef, useState } from "react"
import * as sdk from "microsoft-cognitiveservices-speech-sdk"
import { createLogger } from "@/lib/debug-log"
import { blobToDataUrl, pickRecorderMimeType, startPcmPump } from "@/lib/speech/audio-pipeline"
import { createRecognizer, type RecognizerOptions } from "@/lib/speech/recognizer"
import { findTokenBroker, getSpeechToken, inspectToken, msUntilRefresh, type SpeechToken } from "@/lib/speech/token"

const log = createLogger("session")

export type TranscriptLine = { id: number; text: string; offsetMs: number }
export type SessionRecord = {
  id: string
  startedAt: Date
  durationSec: number
  audioSize: number
  audioType: string
  audioDataUrl: string
  lines: TranscriptLine[]
}
export type SessionState = "idle" | "starting" | "running" | "stopping"
export type SessionStats = { audioState: string; sentSeconds: number; partials: number; firstPartialMs: number | null; level: number }
// token を省略するとトークン発行コネクタから取得する（手動トークンは診断用）
export type StartOptions = { token?: string; region?: string; deviceId?: string }

/**
 * マイク・録音・ストリーミング文字起こしを 1 つの開始／停止で扱う。
 * 停止ごとに録音（data: URL）と確定文を 1 件の SessionRecord として返す。
 */
export function useTranscriptionSession(recognizerOptions: RecognizerOptions = {}) {
  const [state, setState] = useState<SessionState>("idle")
  const [interim, setInterim] = useState("")
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [stats, setStats] = useState<SessionStats>({ audioState: "-", sentSeconds: 0, partials: 0, firstPartialMs: null, level: 0 })
  const [brokerAvailable, setBrokerAvailable] = useState<boolean | null>(null)

  const optionsRef = useRef(recognizerOptions)
  const ctxRef = useRef<AudioContext | null>(null)
  const mediaRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pushRef = useRef<sdk.PushAudioInputStream | null>(null)
  const stopPumpRef = useRef<(() => void) | null>(null)
  const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null)
  const statsTimerRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const linesRef = useRef<TranscriptLine[]>([])
  const startedAtRef = useRef<Date>(new Date())
  const counters = useRef({ bytes: 0, chunks: 0, rms: 0, partials: 0, firstPartialMs: null as number | null, t0: 0 })

  useEffect(() => {
    optionsRef.current = recognizerOptions
  }, [recognizerOptions])

  useEffect(() => {
    void findTokenBroker().then((service) => setBrokerAvailable(Boolean(service)))
  }, [])

  const cleanup = useCallback(() => {
    if (statsTimerRef.current) window.clearInterval(statsTimerRef.current)
    statsTimerRef.current = null
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = null
    stopPumpRef.current?.()
    stopPumpRef.current = null
    pushRef.current?.close()
    pushRef.current = null
    mediaRef.current?.getTracks().forEach((t) => t.stop())
    mediaRef.current = null
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(
    async ({ token, region, deviceId }: StartOptions = {}) => {
      if (state !== "idle") return
      const manualToken = (token ?? "").trim().replace(/^"|"$/g, "")
      if (manualToken && !inspectToken(manualToken).valid) {
        log.error(`手動トークンが使えません（${inspectToken(manualToken).message}）。開始できません`)
        return
      }
      if (!manualToken && !(await findTokenBroker())) {
        log.error("トークン発行コネクタが未追加で、手動トークンもありません。開始できません")
        return
      }
      setState("starting")
      log.info("文字起こし＋録音を開始します", { tokenSource: manualToken ? "手動" : "コネクタ", deviceId: deviceId || "(既定)" })

      // ユーザー操作の中で作成・resume する（iframe 内では、ユーザー操作の外で作った AudioContext が開始しない）
      const ctx = ctxRef.current ?? new AudioContext()
      ctxRef.current = ctx
      const resumed = ctx.resume()

      try {
        const auth = manualToken ? { token: manualToken, region: (region ?? "").trim(), expiresAt: 0 } : await getSpeechToken()
        const media = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
        })
        mediaRef.current = media
        const track = media.getAudioTracks()[0]
        log.info("マイク取得", { label: track?.label, settings: track?.getSettings(), muted: track?.muted, readyState: track?.readyState })
        track?.addEventListener("mute", () => log.warn("マイク トラックが mute されました"))
        track?.addEventListener("ended", () => log.warn("マイク トラックが終了しました"))

        // resume() は拒否されずに保留のままになることがあるため、タイムアウト付きで待つ
        await Promise.race([resumed, new Promise((resolve) => window.setTimeout(resolve, 3000))])
        log.info("AudioContext", { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency })
        if (ctx.state !== "running") {
          throw new Error(`AudioContext が ${ctx.state} のまま開始できません（ユーザー操作として扱われていない可能性）。もう一度押してください`)
        }

        const mimeType = pickRecorderMimeType()
        const recorder = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined)
        chunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.onerror = (e) => log.error("MediaRecorder エラー", e)
        recorder.start(1000)
        recorderRef.current = recorder
        log.info("録音開始", { mimeType: recorder.mimeType })

        const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1))
        pushRef.current = push
        const { recognizer, scoped } = createRecognizer(sdk.AudioConfig.fromStreamInput(push), auth.token, auth.region, "mic", optionsRef.current)

        counters.current = { bytes: 0, chunks: 0, rms: 0, partials: 0, firstPartialMs: null, t0: performance.now() }
        linesRef.current = []
        setLines([])
        setInterim("")
        startedAtRef.current = new Date()

        recognizer.recognizing = (_s, e) => {
          const c = counters.current
          c.partials += 1
          if (c.firstPartialMs === null) {
            c.firstPartialMs = Math.round(performance.now() - c.t0)
            scoped.info(`最初の途中結果 (${c.firstPartialMs} ms)`)
          }
          scoped.debug("途中結果", e.result.text)
          setInterim(e.result.text)
        }
        recognizer.recognized = (_s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            const line = { id: linesRef.current.length + 1, text: e.result.text, offsetMs: Math.round(e.result.offset / 10000) }
            linesRef.current = [...linesRef.current, line]
            setLines(linesRef.current)
            setInterim("")
            scoped.info("確定", e.result.text)
          } else if (e.result.reason === sdk.ResultReason.NoMatch) {
            scoped.warn("NoMatch", sdk.NoMatchReason[sdk.NoMatchDetails.fromResult(e.result).reason])
          }
        }
        recognizer.canceled = (_s, e) => {
          const detail = { reason: sdk.CancellationReason[e.reason], code: sdk.CancellationErrorCode[e.errorCode], details: e.errorDetails }
          if (e.reason === sdk.CancellationReason.Error) scoped.error("認識がエラーで中断", detail)
          else scoped.info("認識が終了", detail)
        }

        const pump = await startPcmPump(ctx, media, (pcm, rms) => {
          push.write(pcm)
          const c = counters.current
          c.bytes += pcm.byteLength
          c.chunks += 1
          c.rms = rms
        })
        stopPumpRef.current = pump.stop
        if (pump.fallbackReason) log.warn("AudioWorklet を使えないため ScriptProcessor で取り込みます", pump.fallbackReason)
        log.info("音声の取り込み方式", { mode: pump.mode })

        statsTimerRef.current = window.setInterval(() => {
          const c = counters.current
          // 送信音声の秒数が経過時間より遅れていれば、端末の負荷で音声が欠けている
          const snapshot = { audioState: ctx.state, sentSeconds: c.bytes / 32000, partials: c.partials, firstPartialMs: c.firstPartialMs, level: Math.min(1, c.rms * 4) }
          setStats(snapshot)
          log.debug("音声送信状況", { ...snapshot, chunks: c.chunks, track: track?.readyState, muted: track?.muted })
        }, 1000)

        await new Promise<void>((resolve, reject) => recognizer.startContinuousRecognitionAsync(resolve, (err) => reject(new Error(err))))
        recognizerRef.current = recognizer

        if (!manualToken) {
          // 実行中にトークンが失効しないよう、失効の 60 秒前に再取得して認識器へ差し替える
          const schedule = (current: SpeechToken) => {
            refreshTimerRef.current = window.setTimeout(async () => {
              try {
                const next = await getSpeechToken(true)
                if (recognizerRef.current !== recognizer) return
                recognizer.authorizationToken = next.token
                log.info("Speech トークンを更新しました")
                schedule(next)
              } catch (error) {
                log.error("Speech トークンの更新に失敗。15 秒後に再試行します", error)
                schedule({ ...current, expiresAt: Date.now() + 75_000 })
              }
            }, msUntilRefresh(current))
          }
          schedule(auth)
        }

        setState("running")
        log.info("文字起こし＋録音 実行中")
      } catch (error) {
        log.error("開始に失敗しました", error)
        if (recorderRef.current?.state === "recording") recorderRef.current.stop()
        cleanup()
        setState("idle")
      }
    },
    [cleanup, state],
  )

  const stop = useCallback(async () => {
    if (state !== "running") return
    setState("stopping")
    log.info("停止します")
    stopPumpRef.current?.()
    stopPumpRef.current = null
    pushRef.current?.close()

    const recognizer = recognizerRef.current
    if (recognizer) {
      await new Promise<void>((resolve) =>
        recognizer.stopContinuousRecognitionAsync(resolve, (err) => {
          log.error("認識の停止でエラー", err)
          resolve()
        }),
      )
      recognizer.close()
      recognizerRef.current = null
    }

    const recorder = recorderRef.current
    let blob = new Blob()
    if (recorder && recorder.state !== "inactive") {
      blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }))
        recorder.stop()
      })
    }
    recorderRef.current = null
    cleanup()

    const record: SessionRecord = {
      id: crypto.randomUUID(),
      startedAt: startedAtRef.current,
      durationSec: (Date.now() - startedAtRef.current.getTime()) / 1000,
      audioSize: blob.size,
      audioType: blob.type,
      audioDataUrl: blob.size > 0 ? await blobToDataUrl(blob) : "",
      lines: linesRef.current,
    }
    setRecords((prev) => [record, ...prev])
    setInterim("")
    setState("idle")
    log.info("記録を保存しました", { id: record.id, durationSec: record.durationSec.toFixed(1), audioKB: (record.audioSize / 1024).toFixed(1), lines: record.lines.length })
    return record
  }, [cleanup, state])

  return { state, interim, lines, records, stats, brokerAvailable, start, stop }
}
