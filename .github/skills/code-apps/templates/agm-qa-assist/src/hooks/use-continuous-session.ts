import { useCallback, useEffect, useRef, useState } from "react"
import * as sdk from "microsoft-cognitiveservices-speech-sdk"
import { createLogger } from "@/lib/debug-log"
import { blobToDataUrl, startPcmPump } from "@/lib/speech/audio-pipeline"
import { PcmSegmenter } from "@/lib/speech/pcm-segmenter"
import { createRecognizer, type RecognizerOptions } from "@/lib/speech/recognizer"
import { findTokenBroker, getSpeechToken, inspectToken, msUntilRefresh, type SpeechToken } from "@/lib/speech/token"
import type { SessionState, SessionStats } from "@/hooks/use-transcription-session"

const log = createLogger("session")

export type FinalLine = { id: number; text: string; offsetMs: number }
export type InterimLine = { text: string; offsetMs: number }
export type AudioPiece = { dataUrl: string; type: string; durationSec: number }
export type ContinuousStartOptions = { token?: string; region?: string; deviceId?: string }

/**
 * 止めずに続ける文字起こし。確定文と途中結果に音声上の位置（ms）を付けて返し、
 * 発言の区切りで takeAudio(位置) を呼ぶと、前回の区切りからそこまでの録音を WAV で返す。
 * 位置は認識結果の offset（音声ストリームの先頭から）なので、Push ストリームに送った PCM と一致する。
 */
export function useContinuousSession(recognizerOptions: RecognizerOptions = {}) {
  const [state, setState] = useState<SessionState>("idle")
  const [interim, setInterim] = useState<InterimLine | null>(null)
  const [lines, setLines] = useState<FinalLine[]>([])
  const [stats, setStats] = useState<SessionStats>({ audioState: "-", sentSeconds: 0, partials: 0, firstPartialMs: null, level: 0 })
  const [brokerAvailable, setBrokerAvailable] = useState<boolean | null>(null)

  const optionsRef = useRef(recognizerOptions)
  const ctxRef = useRef<AudioContext | null>(null)
  const mediaRef = useRef<MediaStream | null>(null)
  const pushRef = useRef<sdk.PushAudioInputStream | null>(null)
  const stopPumpRef = useRef<(() => void) | null>(null)
  const recognizerRef = useRef<sdk.SpeechRecognizer | null>(null)
  const statsTimerRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const linesRef = useRef<FinalLine[]>([])
  const segmenter = useRef(new PcmSegmenter())
  const counters = useRef({ bytes: 0, rms: 0, partials: 0, firstPartialMs: null as number | null, t0: 0 })

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
    async ({ token, region, deviceId }: ContinuousStartOptions = {}) => {
      if (state !== "idle") return false
      const manualToken = (token ?? "").trim().replace(/^"|"$/g, "")
      if (manualToken && !inspectToken(manualToken).valid) {
        log.error(`手動トークンが使えません（${inspectToken(manualToken).message}）。開始できません`)
        return false
      }
      if (!manualToken && !(await findTokenBroker())) {
        log.error("トークン発行コネクタが未追加で、手動トークンもありません。開始できません")
        return false
      }
      setState("starting")
      log.info("連続の文字起こし＋録音を開始します", { tokenSource: manualToken ? "手動" : "コネクタ", deviceId: deviceId || "(既定)" })
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
        track?.addEventListener("ended", () => log.warn("マイク トラックが終了しました"))
        await Promise.race([resumed, new Promise((resolve) => window.setTimeout(resolve, 3000))])
        log.info("AudioContext", { state: ctx.state, sampleRate: ctx.sampleRate })
        if (ctx.state !== "running") throw new Error(`AudioContext が ${ctx.state} のまま開始できません。もう一度押してください`)

        segmenter.current.reset()
        const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1))
        pushRef.current = push
        const { recognizer, scoped } = createRecognizer(sdk.AudioConfig.fromStreamInput(push), auth.token, auth.region, "mic", optionsRef.current)
        counters.current = { bytes: 0, rms: 0, partials: 0, firstPartialMs: null, t0: performance.now() }
        linesRef.current = []
        setLines([])
        setInterim(null)

        recognizer.recognizing = (_s, e) => {
          const c = counters.current
          c.partials += 1
          if (c.firstPartialMs === null) {
            c.firstPartialMs = Math.round(performance.now() - c.t0)
            scoped.info(`最初の途中結果 (${c.firstPartialMs} ms)`)
          }
          scoped.debug("途中結果", e.result.text)
          setInterim({ text: e.result.text, offsetMs: Math.round(e.result.offset / 10000) })
        }
        recognizer.recognized = (_s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            const line = { id: linesRef.current.length + 1, text: e.result.text, offsetMs: Math.round(e.result.offset / 10000) }
            linesRef.current = [...linesRef.current, line]
            setLines(linesRef.current)
            setInterim(null)
            scoped.info("確定", { offsetMs: line.offsetMs, text: e.result.text })
          } else if (e.result.reason === sdk.ResultReason.NoMatch) {
            scoped.debug("NoMatch", sdk.NoMatchReason[sdk.NoMatchDetails.fromResult(e.result).reason])
          }
        }
        recognizer.canceled = (_s, e) => {
          const detail = { reason: sdk.CancellationReason[e.reason], code: sdk.CancellationErrorCode[e.errorCode], details: e.errorDetails }
          if (e.reason === sdk.CancellationReason.Error) scoped.error("認識がエラーで中断", detail)
          else scoped.info("認識が終了", detail)
        }

        const pump = await startPcmPump(ctx, media, (pcm, rms) => {
          // 認識の offset と同じ時間軸で録音を持つため、Push ストリームに送る PCM そのものを保存する
          segmenter.current.append(pcm)
          push.write(pcm)
          counters.current.bytes += pcm.byteLength
          counters.current.rms = rms
        })
        stopPumpRef.current = pump.stop
        log.info("音声の取り込み方式", { mode: pump.mode })

        statsTimerRef.current = window.setInterval(() => {
          const c = counters.current
          const snapshot = { audioState: ctx.state, sentSeconds: c.bytes / 32000, partials: c.partials, firstPartialMs: c.firstPartialMs, level: Math.min(1, c.rms * 4) }
          setStats(snapshot)
          log.debug("音声送信状況", { ...snapshot, bufferedSec: segmenter.current.bufferedSeconds.toFixed(1) })
        }, 1000)

        await new Promise<void>((resolve, reject) => recognizer.startContinuousRecognitionAsync(resolve, (err) => reject(new Error(err))))
        recognizerRef.current = recognizer

        if (!manualToken) {
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
        log.info("連続の文字起こし＋録音 実行中")
        return true
      } catch (error) {
        log.error("開始に失敗しました", error)
        cleanup()
        setState("idle")
        return false
      }
    },
    [cleanup, state],
  )

  /** 前回の区切りから untilMs（省略時は末尾）までの録音 */
  const takeAudio = useCallback(async (untilMs?: number): Promise<AudioPiece | null> => {
    const piece = segmenter.current.take(untilMs)
    if (!piece) return null
    return { dataUrl: await blobToDataUrl(piece.blob), type: piece.blob.type, durationSec: piece.durationSec }
  }, [])

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
    cleanup()
    setInterim(null)
    setState("idle")
    log.info("停止しました", { lines: linesRef.current.length })
  }, [cleanup, state])

  return { state, interim, lines, stats, brokerAvailable, start, stop, takeAudio }
}
