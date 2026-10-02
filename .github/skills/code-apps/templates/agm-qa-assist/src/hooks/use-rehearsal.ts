import { useCallback, useEffect, useRef, useState } from "react"
import { createLogger } from "@/lib/debug-log"
import type { FinalLine, InterimLine } from "@/hooks/use-continuous-session"

const log = createLogger("rehearsal")

export interface ScriptLine {
  id: string
  role: "chair" | "shareholder" | "officer"
  speaker: string
  number?: string
  voice?: string
  text: string
}

/**
 * 台本をテキストのまま話す速さで流す（音声・録音なし）。マイクの文字起こしと同じ形（確定文 + 途中結果、位置付き）で返す。
 * 画面の動きを短時間で確かめる用途。
 */
export function useTextRehearsal(charsPerSecond = 10) {
  const [running, setRunning] = useState(false)
  const [interim, setInterim] = useState<InterimLine | null>(null)
  const [lines, setLines] = useState<FinalLine[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const clear = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }
  useEffect(() => clear, [])

  const start = useCallback(
    (script: ScriptLine[]) => {
      clear()
      let index = 0
      let pos = 0
      let clock = 0
      let lineStart = 0
      const step = 2
      const tickMs = (1000 * step) / charsPerSecond
      const finals: FinalLine[] = []
      setLines([])
      setInterim(null)
      setRunning(true)
      log.info("テキストのリハーサルを開始します", { lines: script.length })
      timerRef.current = window.setInterval(() => {
        const line = script[index]
        if (!line) {
          clear()
          setRunning(false)
          setCurrentId(null)
          log.info("台本の再生が終わりました")
          return
        }
        if (pos === 0) {
          setCurrentId(line.id)
          lineStart = clock
        }
        pos = Math.min(line.text.length, pos + step)
        clock += tickMs
        if (pos >= line.text.length) {
          finals.push({ id: finals.length + 1, text: line.text, offsetMs: Math.round(lineStart) })
          setLines([...finals])
          setInterim(null)
          index += 1
          pos = 0
          clock += 600
        } else {
          setInterim({ text: line.text.slice(0, pos), offsetMs: Math.round(lineStart) })
        }
      }, tickMs)
    },
    [charsPerSecond],
  )

  const stop = useCallback(() => {
    clear()
    setRunning(false)
    setInterim(null)
    setCurrentId(null)
    log.info("テキストのリハーサルを停止しました")
  }, [])

  return { running, interim, lines, currentId, start, stop }
}

/** Windows に入っている日本語の音声（ローカル）。クラウドの音声（Natural など）は使わない */
export function localJapaneseVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ja") && v.localService)
}

/**
 * 台本を Windows の音声（Web Speech API の speechSynthesis、ローカルの音声だけ）で順に読み上げる。
 * スピーカーの音をマイクで拾わせて、本番と同じ経路（マイク → 文字起こし → 区切り → 保存）を確かめる。
 */
export function useScriptReader() {
  const [speaking, setSpeaking] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(localJapaneseVoices)
  const cancelled = useRef(false)

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return
    const update = () => setVoices(localJapaneseVoices())
    speechSynthesis.addEventListener("voiceschanged", update)
    update()
    return () => speechSynthesis.removeEventListener("voiceschanged", update)
  }, [])

  /** ブラウザは操作の中でしか読み上げを始めないため、開始ボタンの中で呼んで許可を得ておく */
  const unlock = useCallback(() => {
    if (typeof speechSynthesis === "undefined") return
    const u = new SpeechSynthesisUtterance(" ")
    u.volume = 0
    speechSynthesis.speak(u)
  }, [])

  const read = useCallback(async (script: ScriptLine[], options: { gapMs?: number; rate?: number } = {}) => {
    if (typeof speechSynthesis === "undefined") {
      log.error("このブラウザは読み上げ（speechSynthesis）に対応していません")
      return
    }
    const available = localJapaneseVoices()
    if (!available.length) {
      log.error("Windows の日本語の音声が見つかりません（設定 > 時刻と言語 > 音声 で日本語の音声を追加）")
      return
    }
    cancelled.current = false
    setSpeaking(true)
    log.info("台本の読み上げを開始します", { voices: available.map((v) => v.name) })
    for (const line of script) {
      if (cancelled.current) break
      setCurrentId(line.id)
      const voice = available.find((v) => line.voice && v.name.includes(line.voice)) ?? available[0]
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(line.text)
        u.lang = "ja-JP"
        u.voice = voice
        u.rate = options.rate ?? 1
        u.onend = () => resolve()
        u.onerror = (e) => {
          log.warn("読み上げエラー", { line: line.id, error: e.error })
          resolve()
        }
        speechSynthesis.speak(u)
      })
      await new Promise((r) => window.setTimeout(r, options.gapMs ?? 900))
    }
    setSpeaking(false)
    setCurrentId(null)
    log.info(cancelled.current ? "読み上げを中止しました" : "台本の読み上げが終わりました")
  }, [])

  const cancel = useCallback(() => {
    cancelled.current = true
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
    setSpeaking(false)
    setCurrentId(null)
  }, [])

  return { speaking, currentId, voices, unlock, read, cancel }
}
