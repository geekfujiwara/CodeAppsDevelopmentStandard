import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { TopBar, type Mode, type RehearsalStyle, type View } from "@/components/agm/top-bar"
import { QaLibrary } from "@/components/agm/qa-library"
import { useGenerations } from "@/hooks/use-generations"
import { TranscriptPanel } from "@/components/agm/transcript-panel"
import { QuestionCards } from "@/components/agm/question-cards"
import { AnswersColumn } from "@/components/agm/answers-column"
import { CardAnswerLinks } from "@/components/agm/card-answer-links"
import { ShareholderPanel, type IdentState, type NumberSource, type TodayTurn } from "@/components/agm/shareholder-panel"
import { ShareholderPicker } from "@/components/agm/shareholder-picker"
import { MeetingView } from "@/components/agm/meeting-view"
import { LiveDialog } from "@/components/agm/live-dialog"
import { LiveWatch } from "@/components/agm/live-watch"
import { currentUser, listLiveSessions, packCards, publishState, type LiveSession, type LiveState } from "@/lib/agm/live"
import { listMeetings, storeMeetingId, storedMeetingId, type Meeting } from "@/lib/agm/meetings"
import { SourceProvider } from "@/components/agm/source-context"
import { identifyShareholder } from "@/lib/agm/identify"
import { introName } from "@/lib/agm/match"
import { ScriptPanel } from "@/components/agm/script-panel"
import { RecordsPanel, type LocalRecord, type RecordsTab } from "@/components/agm/records-panel"
import { SettingsView } from "@/components/agm/settings-view"
import { SttComparePanel } from "@/components/agm/stt-compare-panel"
import { useRefine } from "@/hooks/use-refine"
import { loadSettings, useSettings } from "@/lib/agm/settings"
import { useContinuousSession } from "@/hooks/use-continuous-session"
import { useScriptReader, useTextRehearsal, type ScriptLine } from "@/hooks/use-rehearsal"
import { analyzeOnce, useAgmAnalysis } from "@/hooks/use-agm-analysis"
import type { SessionState } from "@/hooks/use-transcription-session"
import { createLogger } from "@/lib/debug-log"
import { MEETING_TITLE, missingConfig } from "@/lib/agm/config"
import { errorText, isApproved, loadCorpus, type CorpusSource } from "@/lib/agm/corpus"
import { createEngine } from "@/lib/agm/engine"
import type { Card } from "@/lib/agm/engine"
import { listQuestionCodes, listTurns, saveTurn, setRecordingMeeting, updateTurnKeyInfo, type QuestionRecord, type SaveSteps, type TurnSummary } from "@/lib/agm/records"
import { loadRegister, lookupShareholder, matchShareholders, nameMatches, numberVariants, type Shareholder, type ShareholderProfile } from "@/lib/agm/shareholders"
import { answerStart, splitTurns, turnText, type Phrase, type Turn } from "@/lib/agm/turns"
import type { Corpus, TranscriptView } from "@/lib/agm/types"
import { DEMO_SCRIPT, listScripts, storeScriptId, storedScriptId, type RehearsalScript } from "@/lib/agm/scripts"

const log = createLogger("cockpit")
const NO_QA: Corpus["qa"] = []
const NO_IR: Corpus["ir"] = []
const EMPTY_TURN: Turn = { key: "t-empty", number: null, heard: null, spokenName: null, startOffsetMs: 0, phrases: [], cause: "start" }

/** これ以上の確からしさなら、AI の照合結果をそのまま株主番号に使う（未満は候補を出して担当者が選ぶ） */
const AUTO_APPLY = 0.8

type Idents = Record<string, IdentState>

/** 株主番号の決め方: 手入力 ＞ AI 照合（確からしさ 0.8 以上）＞ 発言から検出 */
function resolveNumber(turn: Turn, overrides: Record<string, string>, idents: Idents): { number: string | null; source: NumberSource } {
  if (overrides[turn.key] !== undefined) return { number: overrides[turn.key] || null, source: overrides[turn.key] ? "manual" : null }
  const id = idents[turn.key]
  if (id?.status === "done" && id.number && (id.confidence ?? 0) >= AUTO_APPLY) return { number: id.number, source: "ai" }
  return { number: turn.number, source: turn.number ? "detected" : null }
}

/** 名乗りの部分（「株主番号」か名前を含む最初の確定文と、その次の文）。確定していなければ null */
function introOf(turn: Turn): string | null {
  const idx = turn.phrases.findIndex((p) => /株主番号|申します|と言います/.test(p.text) || (turn.spokenName ? p.text.includes(turn.spokenName) : false))
  if (idx < 0 || !turn.phrases[idx].final) return null
  return turn.phrases
    .slice(idx, idx + 2)
    .filter((p) => p.final)
    .map((p) => p.text)
    .join("")
    .slice(0, 200)
}

function viewOf(turn: Turn): TranscriptView {
  const text = turnText(turn)
  const last = turn.phrases[turn.phrases.length - 1]
  return { text, interimStart: last && !last.final ? text.length - last.text.length : text.length }
}

export default function Cockpit() {
  const [corpus, setCorpus] = useState<Corpus | null>(null)
  const [corpusInfo, setCorpusInfo] = useState<{ source?: CorpusSource; ms?: number; error?: string }>({})
  const qaRowIds = useRef(new Map<string, string>())
  const [mode, setMode] = useState<Mode>("live")
  const [style, setStyle] = useState<RehearsalStyle>("tts")
  const [sessionStart, setSessionStart] = useState<Date | null>(null)
  const [now, setNow] = useState(Date.now())
  const [manualCuts, setManualCuts] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [idents, setIdents] = useState<Idents>({})
  const identsRef = useRef<Idents>({})
  const identPromises = useRef(new Map<string, Promise<void>>())
  const [roster, setRoster] = useState<{ list: Shareholder[]; state: "loading" | "ready" | "failed" }>({ list: [], state: "loading" })
  const [picker, setPicker] = useState<{ target: { kind: "turn"; key: string } | { kind: "saved"; id: string }; query: string } | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [meetingRefresh, setMeetingRefresh] = useState(0)
  const [live, setLive] = useState<LiveSession | null>(null)
  const [liveOpen, setLiveOpen] = useState(false)
  const [lastPublished, setLastPublished] = useState<{ at: number; revision: number; bytes: number; ms: number } | null>(null)
  const [watchable, setWatchable] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, ShareholderProfile>>({})
  const [loadingNumbers, setLoadingNumbers] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string>()
  const [pinned, setPinned] = useState(false)
  const [local, setLocal] = useState<LocalRecord[]>([])
  const [saved, setSaved] = useState<TurnSummary[]>([])
  const [loadingTurns, setLoadingTurns] = useState(false)
  const [bottomTab, setBottomTab] = useState<RecordsTab>("records")
  const [review, setReview] = useState<{ turn: TurnSummary; cards: Card[] } | null>(null)
  const [closing, setClosing] = useState(false)
  // テスト用ビルドだけ: VITE_DEV_LIBRARY_QUERY があれば想定問答の画面で検索した状態から始める
  const [view, setView] = useState<View>(import.meta.env.VITE_DEV_LIBRARY_QUERY ? "library" : "cockpit")

  // 質疑応答の検索・キーワードに使うのは承認済みの想定問答だけ（Cowork・アプリで作った下書きは承認まで使わない）
  const approvedCorpus = useMemo(() => (corpus ? { ...corpus, qa: corpus.qa.filter(isApproved) } : null), [corpus])
  const libraryEngine = useMemo(() => (corpus ? createEngine(corpus) : null), [corpus])
  const phraseList = useMemo(() => (approvedCorpus ? ["株主番号", ...new Set(approvedCorpus.qa.flatMap((q) => q.keywords))].slice(0, 400) : ["株主番号"]), [approvedCorpus])
  const recognizerOptions = useMemo(() => ({ phrases: phraseList }), [phraseList])
  const session = useContinuousSession(recognizerOptions)
  const text = useTextRehearsal()
  const reader = useScriptReader()
  // リハーサル台本（Dataverse の台本 + 同梱のデモ台本）
  const [scripts, setScripts] = useState<RehearsalScript[]>([DEMO_SCRIPT])
  const [scriptId, setScriptId] = useState(storedScriptId)
  useEffect(() => {
    listScripts()
      .then(setScripts)
      .catch((error) => log.warn("台本を読み込めません（同梱のデモ台本を使います）", errorText(error)))
  }, [])
  const script = scripts.find((s) => s.id === scriptId) ?? DEMO_SCRIPT
  const SCRIPT: ScriptLine[] = script.lines

  const textMode = mode === "rehearsal" && style === "text"
  const lines = textMode ? text.lines : session.lines
  const interim = textMode ? text.interim : session.interim
  const state: SessionState = closing ? "stopping" : textMode ? (text.running ? "running" : "idle") : session.state

  // 文字起こしの方式（設定）。MAI / 比較では確定文ごとに MAI-Transcribe で認識し直す（文字だけのリハーサルは録音が無いので対象外）
  const { settings } = useSettings()
  useEffect(() => void loadSettings().catch((error) => log.warn("設定を読み込めません（初期値で動きます）", errorText(error))), [])
  const engine = textMode ? "azure" : settings.stt.engine
  const refined = useRefine(session.lines, engine, session.sliceAudio, phraseList, sessionStart)

  // 確定文と途中結果を、同じキー（p + 確定文の番号）で並べる。途中結果が確定してもキーは変わらない
  const phrases: Phrase[] = useMemo(
    () => [
      ...lines.map((l) => ({ key: `p${l.id}`, text: engine === "mai" && refined[l.id]?.status === "done" && refined[l.id].text ? refined[l.id].text! : l.text, offsetMs: l.offsetMs, final: true })),
      ...(interim?.text ? [{ key: `p${lines.length + 1}`, text: interim.text, offsetMs: interim.offsetMs, final: false }] : []),
    ],
    [lines, interim, engine, refined],
  )
  const turns = useMemo(() => splitTurns(phrases, manualCuts), [phrases, manualCuts])
  const current = turns[turns.length - 1] ?? EMPTY_TURN
  const numberOf = useCallback((turn: Turn) => resolveNumber(turn, overrides, idents).number, [overrides, idents])
  const currentResolved = resolveNumber(current, overrides, idents)
  const currentNumber = currentResolved.number

  const liveView = useMemo(() => viewOf(current), [current])
  const ansFrom = answerStart(liveView.text)
  // 株主番号が取れなくても質問の整理と回答案の生成は進める（議長の進行の言葉はエンジン側で質問にしない）
  const analysisView = useMemo(() => ({ text: liveView.text.slice(0, ansFrom), interimStart: Math.min(liveView.interimStart, ansFrom) }), [liveView, ansFrom])
  const analysis = useAgmAnalysis(approvedCorpus, current.key, analysisView)
  const generation = useGenerations(analysis.engine, corpus?.ir ?? [], analysis.cards, analysisView.interimStart, true, current.key)

  const overridesRef = useRef(overrides)
  overridesRef.current = overrides
  const latest = useRef({ turns, numberOf, profiles, sessionStart, textMode, mode })
  latest.current = { turns, numberOf, profiles, sessionStart, textMode, mode }

  useEffect(() => {
    void loadCorpus()
      .then(({ corpus: c, source, ms, qaRowIds: ids }) => {
        qaRowIds.current = ids
        setCorpus(c)
        setCorpusInfo({ source, ms })
      })
      .catch((error) => {
        log.error("想定問答を読み込めません", error)
        setCorpusInfo({ error: errorText(error) })
      })
  }, [])

  const reloadTurns = useCallback(() => {
    if (import.meta.env.VITE_DEV_LOCAL_CORPUS === "1") return
    setLoadingTurns(true)
    listTurns(meeting?.id)
      .then(setSaved)
      .catch((error) => log.warn("記録を読み込めません", errorText(error)))
      .finally(() => setLoadingTurns(false))
  }, [meeting?.id])
  useEffect(() => reloadTurns(), [reloadTurns])

  /** 記録先の株主総会を切り替える（記録パネル・保存先・SharePoint のフォルダーが切り替わる） */
  const selectMeeting = useCallback((m: Meeting) => {
    storeMeetingId(m.id)
    setRecordingMeeting({ id: m.id, title: m.title })
    setMeeting(m)
    log.info("記録先の株主総会", { id: m.id, title: m.title })
  }, [])
  useEffect(() => {
    listMeetings()
      .then((list) => {
        const stored = storedMeetingId()
        const m = list.find((x) => x.id === stored) ?? list.find((x) => x.title === MEETING_TITLE) ?? list[0]
        if (m) selectMeeting(m)
      })
      .catch((error) => log.warn("株主総会の一覧を読めません（.env の総会名で記録します）", errorText(error)))
  }, [selectMeeting])

  // LIVE: 自分が配信中のものは再開、ほかの人から共有されたものがあれば「LIVE 視聴」を出す
  useEffect(() => {
    const check = () =>
      Promise.all([listLiveSessions(), currentUser()])
        .then(([sessions, me]) => {
          const mine = sessions.find((s) => me.objectId && s.ownerObjectId === me.objectId)
          const others = sessions.filter((s) => s !== mine)
          setLive((cur) => cur ?? mine ?? null)
          setWatchable((was) => {
            if (!was && others.length && !mine && me.objectId) setView((v) => (v === "cockpit" ? "watch" : v))
            return others.length > 0 || import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"
          })
        })
        .catch((error) => log.warn("LIVE を確認できません", errorText(error)))
    void check()
    const t = window.setInterval(check, 30000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (state !== "running") return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [state])

  const fetchProfile = useCallback((number: string, refresh = false) => {
    setLoadingNumbers((s) => new Set(s).add(number))
    return lookupShareholder(number, { refresh }).then((profile) => {
      setProfiles((p) => ({ ...p, [number]: profile }))
      setLoadingNumbers((s) => {
        const next = new Set(s)
        next.delete(number)
        return next
      })
      return profile
    })
  }, [])

  // 株主番号を拾ったら、名簿と過去の質問を引く
  useEffect(() => {
    if (!currentNumber) return
    log.info("株主を検出", { number: currentNumber, spokenName: current.spokenName, cause: current.cause, atMs: current.startOffsetMs })
    void fetchProfile(currentNumber)
    // 番号が変わったときだけ引く
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNumber])

  useEffect(() => {
    loadRegister()
      .then((list) => setRoster({ list, state: "ready" }))
      .catch((error) => {
        log.warn("株主名簿を読み込めません（AI 照合は使わず、発言の番号だけで進めます）", errorText(error))
        setRoster({ list: [], state: "failed" })
      })
  }, [])

  const setIdent = useCallback((key: string, value: IdentState) => {
    identsRef.current = { ...identsRef.current, [key]: value }
    setIdents(identsRef.current)
  }, [])

  // 名乗りが確定したら、名簿と AI で株主を照合する（聞き違いの番号・漢数字・番号を言わない株主にも対応）
  useEffect(() => {
    if (roster.state === "loading") return
    for (const turn of turns) {
      if (identPromises.current.has(turn.key) || processed.current.has(turn.key)) continue
      if (!turn.number && !turn.heard && !turn.spokenName) continue
      const intro = introOf(turn)
      if (!intro) continue
      const exact = turn.number ? roster.list.find((s) => numberVariants(turn.number!).includes(s.number)) : undefined
      const spoken = turn.spokenName ?? introName(intro)
      if (exact && nameMatches(spoken, exact.name) !== false) {
        // 番号が名簿にあり、名乗った名前とも矛盾しない → AI を呼ばずに確定
        setIdent(turn.key, { status: "done", number: exact.number, confidence: spoken ? 1 : 0.95, reason: spoken ? "番号と名前が名簿と一致" : "番号が名簿と一致", ms: 0, candidates: [] })
        identPromises.current.set(turn.key, Promise.resolve())
        continue
      }
      if (!roster.list.length) continue
      setIdent(turn.key, { status: "running" })
      log.info("名乗りを照合します", { turn: turn.key, intro, detected: turn.number, spokenName: spoken })
      identPromises.current.set(
        turn.key,
        identifyShareholder(intro, roster.list).then((r) =>
          setIdent(turn.key, { status: "done", number: r.number, confidence: r.confidence, reason: r.reason, ms: r.ms, candidates: r.candidates.map((c) => c.shareholder) }),
        ),
      )
    }
  }, [turns, roster, setIdent])

  // 新しい質問が出たら、それを選ぶ（担当者が選んだ後は、次の新しい質問まで動かさない）
  const cardCount = analysis.cards.length
  useEffect(() => {
    const newest = analysis.cards[cardCount - 1]
    if (!newest) {
      setSelectedId(undefined)
      return
    }
    if (!pinned || !analysis.cards.some((c) => c.id === selectedId)) {
      setSelectedId(newest.id)
      setPinned(false)
    }
  }, [cardCount, analysis.cards, pinned, selectedId])

  useEffect(() => {
    setPinned(false)
    if (current.key !== EMPTY_TURN.key) log.info("発言者を区切りました", { cause: current.cause, number: current.number, heard: current.heard, spokenName: current.spokenName, atMs: current.startOffsetMs })
    // 区切りが変わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.key])

  /** 閉じたターンを保存する。録音はターンの区切り（次のターンの始まり）で切り出す */
  const closeTurn = useCallback(
    async (turn: Turn, untilMs: number | undefined) => {
      const { profiles: known, sessionStart: started, textMode: noAudio, mode: m } = latest.current
      const transcript = turnText(turn)
      // 照合中なら結果を待ってから番号を決める
      await identPromises.current.get(turn.key)
      const resolved = resolveNumber(turn, overridesRef.current, identsRef.current)
      const number = resolved.number ?? ""
      const ident = identsRef.current[turn.key]
      const cards = analysis.finalCards(turn.key, transcript.slice(0, answerStart(transcript)))
      const audioPromise = noAudio ? Promise.resolve(null) : session.takeAudio(untilMs)
      if (!number && !cards.length) {
        await audioPromise
        log.info("株主番号も質問も無い区間（進行の発言）なので保存しません", { turn: turn.key, chars: transcript.length })
        return
      }
      const profile = number ? known[number] ?? (await lookupShareholder(number)) : null
      // 名簿で先頭の 0 などを補えたら、名簿の番号で記録する
      const savedNumber = profile?.shareholder?.number ?? number
      const audio = await audioPromise
      const begun = new Date((started ?? new Date()).getTime() + turn.startOffsetMs)
      const durationSec = audio?.durationSec ?? (untilMs !== undefined ? (untilMs - turn.startOffsetMs) / 1000 : (Date.now() - begun.getTime()) / 1000)
      const questions: QuestionRecord[] = cards.map((card, i) => {
        const qaId = card.segment.novel ? card.adoptedQaId : card.adoptedQaId ?? card.segment.candidates[0]?.doc.id
        const qa = card.segment.candidates.find((c) => c.doc.id === qaId)?.doc
        const ai = generation.generatedFor(card.id)
        return { seq: i + 1, segment: card.segment, qaId, draft: qa && analysis.engine ? analysis.engine.compose(qa) : undefined, adopted: !!card.adoptedQaId, aiDraft: ai?.text, aiModel: ai?.model }
      })
      const name = profile?.shareholder?.name ?? turn.spokenName ?? ""
      const key = turn.key + "-" + begun.getTime()
      const initial: SaveSteps = { audio: audio ? "pending" : "skipped", turn: "pending", questions: "pending" }
      setLocal((prev) => [
        { key, shareholderNumber: savedNumber, shareholderName: name, startedAt: begun, durationSec, questionCount: questions.length, categories: [...new Set(cards.map((c) => c.segment.category))], rehearsal: m === "rehearsal", steps: initial },
        ...prev,
      ])
      const detectedBy =
        resolved.source === "manual"
          ? "番号を手入力"
          : resolved.source === "ai"
            ? `AI 照合（確からしさ ${Math.round((ident?.confidence ?? 0) * 100)}%: ${ident?.reason ?? ""}）`.slice(0, 100)
            : turn.number
              ? `番号を自動検出${savedNumber !== number ? `（${number}→${savedNumber}）` : ""}${ident?.status === "done" && ident.number !== turn.number ? `・AI 候補 ${ident.number ?? "なし"}（${Math.round((ident.confidence ?? 0) * 100)}%）` : ""}`
              : turn.heard
                ? `番号を聞き取れず（「${turn.heard.slice(0, 20)}」）`
                : turn.cause === "cue"
                  ? "議長の指名で区切り（番号なし）"
                  : turn.cause === "manual"
                    ? "手動で区切り"
                    : "番号なし"
      log.info("発言を閉じて保存します", { number: savedNumber, name, questions: questions.length, durationSec: durationSec.toFixed(1), audioKB: audio ? Math.round((audio.dataUrl.length * 3) / 4 / 1024) : 0, detectedBy })
      const result = await saveTurn(
        {
          shareholderNumber: savedNumber,
          shareholderName: name,
          startedAt: begun,
          durationSec,
          transcript,
          audioDataUrl: audio?.dataUrl ?? "",
          audioType: audio?.type ?? "",
          rehearsal: m === "rehearsal",
          questions,
          shareholderRowId: profile?.shareholder?.rowId,
          detectedBy,
          numberHeard: turn.heard ?? (turn.number && savedNumber !== turn.number ? turn.number : undefined),
        },
        qaRowIds.current,
        (steps) => setLocal((prev) => prev.map((r) => (r.key === key ? { ...r, steps } : r))),
      )
      setLocal((prev) => prev.map((r) => (r.key === key ? { ...r, turnId: result.turnId, steps: result.steps, audioUrl: result.audioUrl, error: result.error } : r)))
      reloadTurns()
      setMeetingRefresh((n) => n + 1)
    },
    [analysis, session, reloadTurns, generation],
  )

  // 次の株主の区切りが確定したら、前の株主の発言を保存する（区切りのフレーズが確定するまで待つ）
  const processed = useRef(new Set<string>())
  useEffect(() => {
    for (let i = 0; i < turns.length - 1; i++) {
      const turn = turns[i]
      const next = turns[i + 1]
      if (processed.current.has(turn.key)) continue
      if (!next.phrases[0]?.final) break
      processed.current.add(turn.key)
      void closeTurn(turn, next.startOffsetMs)
    }
  }, [turns, closeTurn])

  // 終了: 残っているターンをすべて閉じる
  useEffect(() => {
    if (!closing || session.state !== "idle" || text.running) return
    const pending = turns.filter((t) => !processed.current.has(t.key))
    pending.forEach((turn, i) => {
      processed.current.add(turn.key)
      const next = pending[i + 1]
      void closeTurn(turn, next ? next.startOffsetMs : undefined)
    })
    setClosing(false)
    log.info("終了しました", { turns: turns.length })
  }, [closing, session.state, text.running, turns, closeTurn])

  // 文字だけのリハーサルは台本の終わりで終了扱いにする
  const textWasRunning = useRef(false)
  useEffect(() => {
    if (text.running) textWasRunning.current = true
    else if (textWasRunning.current) {
      textWasRunning.current = false
      setClosing(true)
    }
  }, [text.running])

  // Windows の読み上げが終わったら、最後の発言が確定するのを待って終了する
  const sessionRef = useRef(session)
  sessionRef.current = session
  const readerWasSpeaking = useRef(false)
  const [readerDone, setReaderDone] = useState(0)
  useEffect(() => {
    if (reader.speaking) readerWasSpeaking.current = true
    else if (readerWasSpeaking.current) {
      readerWasSpeaking.current = false
      setReaderDone((n) => n + 1)
    }
  }, [reader.speaking])
  useEffect(() => {
    if (!readerDone) return
    const t = window.setTimeout(() => {
      if (sessionRef.current.state !== "running") return
      void sessionRef.current.stop().then(() => setClosing(true))
    }, 3000)
    return () => window.clearTimeout(t)
  }, [readerDone])

  const missing = missingConfig()
  const devToken = import.meta.env.VITE_DEV_SPEECH_TOKEN
  const disabledReason = corpusInfo.error
    ? "想定問答を読み込めませんでした"
    : !corpus
      ? "想定問答を読み込んでいます…"
      : !textMode && !devToken && session.brokerAvailable === false
        ? "音声認識のトークン発行コネクタが未設定です"
        : mode === "rehearsal" && style === "tts" && reader.voices.length === 0
          ? "Windows の日本語の音声が見つかりません"
          : undefined

  const begin = async () => {
    processed.current = new Set()
    identPromises.current = new Map()
    identsRef.current = {}
    setIdents({})
    setManualCuts(new Set())
    setOverrides({})
    setReview(null)
    setPinned(false)
    setSessionStart(new Date())
    setNow(Date.now())
    log.info("開始", { mode, style: mode === "rehearsal" ? style : "-" })
    if (mode === "rehearsal") setBottomTab("script")
    if (textMode) {
      text.start(SCRIPT)
      return
    }
    // 読み上げはユーザー操作の中でしか始められないため、待つ前に許可を取る
    if (mode === "rehearsal" && style === "tts") reader.unlock()
    const ok = await session.start({ token: devToken, region: import.meta.env.VITE_DEV_SPEECH_REGION })
    if (ok && mode === "rehearsal" && style === "tts") void reader.read(SCRIPT)
  }

  const toggle = async () => {
    if (state === "running") {
      reader.cancel()
      if (textMode) {
        text.stop()
      } else {
        await session.stop()
        setClosing(true)
      }
      return
    }
    if (disabledReason) return
    await begin()
  }

  const cutHere = () => {
    const key = `p${lines.length + 1}`
    setManualCuts((s) => new Set(s).add(key))
    log.info("手動で区切りました", { from: key })
  }

  // テスト用ビルドだけの自動開始（VITE_DEV_AUTOSTART=text / live）。本番ビルドでは消える
  const autostart = import.meta.env.VITE_DEV_AUTOSTART ?? ""
  const autostarted = useRef(false)
  const beginRef = useRef(begin)
  beginRef.current = begin
  useEffect(() => {
    if (!autostart || autostarted.current || !corpus) return
    if (autostart === "text") {
      setMode("rehearsal")
      setStyle("text")
    }
    const t = window.setTimeout(() => {
      autostarted.current = true
      log.info("テスト用の自動開始", { autostart })
      void beginRef.current()
    }, 1500)
    return () => window.clearTimeout(t)
  }, [autostart, corpus, mode, style])

  // 振り返り
  const openReview = useCallback(
    async (turnId: string) => {
      if (turnId.startsWith("local-")) return
      const turn = saved.find((t) => t.id === turnId) ?? (await listTurns()).find((t) => t.id === turnId)
      if (!turn || !analysis.engine) return
      try {
        const codes = await listQuestionCodes(turnId)
        const cards = analyzeOnce(analysis.engine, turn.transcript.slice(0, answerStart(turn.transcript))).map((c, i) => {
          const code = codes.find((q) => q.seq === i + 1)?.qaCode
          return code ? { ...c, adoptedQaId: code } : c
        })
        setReview({ turn, cards })
        if (turn.shareholderNumber) void fetchProfile(turn.shareholderNumber)
        log.info("記録を振り返ります", { turnId, questions: codes.length })
      } catch (error) {
        log.error("記録を開けません", error)
      }
    },
    [saved, analysis.engine, fetchProfile],
  )

  /** 保存済みの発言の株主番号を後から直す（名簿を引き直し、氏名と紐づけも更新） */
  const editSavedTurn = useCallback(async (turnId: string, number: string) => {
    const holder = number ? (await lookupShareholder(number)).shareholder : null
    const info = { number: holder?.number ?? number, name: holder?.name ?? "", shareholderRowId: holder?.rowId, note: `株主番号を修正（${new Date().toLocaleTimeString("ja-JP")}）` }
    try {
      if (!turnId.startsWith("local-")) await updateTurnKeyInfo(turnId, info)
      setSaved((prev) => prev.map((t) => (t.id === turnId ? { ...t, shareholderNumber: info.number, shareholderName: info.name } : t)))
      setLocal((prev) => prev.map((r) => (r.turnId === turnId ? { ...r, shareholderNumber: info.number, shareholderName: info.name } : r)))
      setReview((r) => (r && r.turn.id === turnId ? { ...r, turn: { ...r.turn, shareholderNumber: info.number, shareholderName: info.name } } : r))
      if (info.number) void fetchProfile(info.number)
      log.info("記録の株主番号を修正しました", { turnId, number: info.number, name: info.name })
    } catch (error) {
      log.error("株主番号を修正できません", error)
    }
  }, [fetchProfile])

  /** 発言中の株主の番号を直す（空にすると未確認に戻す） */
  const editCurrentNumber = (key: string, value: string) => {
    setOverrides((o) => ({ ...o, [key]: value }))
    log.info("株主番号を手で設定しました", { turn: key, number: value || "(未確認)" })
  }

  // 表示（振り返り中は保存した発言、通常は今の株主）
  const shownCards = review ? review.cards : analysis.cards
  const shownView = review ? { text: review.turn.transcript, interimStart: review.turn.transcript.length } : liveView
  const shownAnsFrom = review ? answerStart(review.turn.transcript) : ansFrom
  const lookupNumber = review ? review.turn.shareholderNumber || null : currentNumber
  const shownProfile = lookupNumber ? profiles[lookupNumber] ?? null : null
  const shownNumber = shownProfile?.shareholder?.number ?? lookupNumber
  const today: TodayTurn[] = local
    .filter((r) => r.shareholderNumber && r.shareholderNumber === shownNumber)
    .map((r) => ({ key: r.key, startedAt: r.startedAt, questionCount: r.questionCount, categories: r.categories }))

  // カードと回答案の参照（線で結ぶ・相手の位置までスクロールする）
  const linksBox = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const answerRefs = useRef(new Map<string, HTMLElement>())
  const cardScroll = useRef<HTMLDivElement | null>(null)
  const answerScroll = useRef<HTMLDivElement | null>(null)
  const register = (map: RefObject<Map<string, HTMLElement>>) => (id: string, el: HTMLElement | null) => {
    if (el) map.current.set(id, el)
    else map.current.delete(id)
  }
  const select = (id: string, from: "card" | "answer" | "transcript") => {
    setSelectedId(id)
    setPinned(true)
    if (from !== "answer") answerRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    if (from !== "card") cardRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }
  useEffect(() => {
    if (selectedId && !pinned) answerRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedId, pinned])

  // LIVE: 画面の状態を 1.2 秒ごとに（変わったときだけ）書き込む。閲覧側は 1.5 秒ごとに読む
  const liveSnapshot = useRef<() => LiveState>(() => ({}) as LiveState)
  liveSnapshot.current = () => {
    const holder = (currentNumber ? profiles[currentNumber] : null)?.shareholder
    const gens: LiveState["gens"] = {}
    for (const c of analysis.cards) {
      const g = generation.gens[c.id]
      if (g) gens[c.id] = { ...g }
    }
    return {
      v: 1,
      at: Date.now(),
      meetingTitle: meeting?.title ?? MEETING_TITLE,
      running: state === "running",
      elapsedSec: sessionStart && state === "running" ? (Date.now() - sessionStart.getTime()) / 1000 : 0,
      turnKey: current.key,
      shareholder: {
        number: currentNumber,
        source: currentResolved.source,
        name: holder?.name ?? current.spokenName ?? "",
        kana: holder?.kana ?? "",
        shares: holder?.shares,
        type: holder?.type,
        note: holder?.note,
        spokenName: current.spokenName,
      },
      view: liveView,
      answerFrom: ansFrom,
      cards: packCards(analysis.cards),
      gens,
      selectedId,
      recent: local.slice(0, 10).map((r) => ({ number: r.shareholderNumber, name: r.shareholderName, startedAt: r.startedAt.toISOString(), questions: r.questionCount, categories: r.categories })),
    }
  }
  const liveId = live?.id
  useEffect(() => {
    if (!liveId) return
    let revision = live?.revision ?? 0
    let lastBody = ""
    let inFlight = false
    const tick = () => {
      if (inFlight) return
      const snapshot = liveSnapshot.current()
      const body = JSON.stringify({ ...snapshot, at: 0 })
      if (body === lastBody) return
      inFlight = true
      revision += 1
      const t0 = performance.now()
      publishState(liveId, revision, snapshot)
        .then(() => {
          lastBody = body
          setLastPublished({ at: Date.now(), revision, bytes: body.length, ms: Math.round(performance.now() - t0) })
        })
        .catch((error) => log.warn("LIVE を更新できません", errorText(error)))
        .finally(() => {
          inFlight = false
        })
    }
    const t = window.setInterval(tick, 1200)
    // ブラウザーは裏に回ったタブのタイマーを間引く（数分で 1 分に 1 回）。前面に戻ったらすぐ配信し、裏に回ったことを残す
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick()
      else log.warn("LIVE 配信中にタブが裏に回りました。閲覧側の更新が遅れます（このタブを前面に置いてください）")
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearInterval(t)
      document.removeEventListener("visibilitychange", onVisibility)
    }
    // セッションが変わったときだけ張り直す（状態は ref から読む）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId])

  const status: { label: string; tone: "ok" | "warn" | "danger" | "muted" }[] = [
    corpusInfo.error
      ? { label: "想定問答: 読み込み失敗", tone: "danger" }
      : corpus
        ? { label: `想定問答 ${corpus.qa.length} / IR ${corpus.ir.length}${corpusInfo.source === "local-demo" ? "（ローカル）" : ""}`, tone: corpusInfo.source === "local-demo" ? "warn" : "ok" }
        : { label: "想定問答: 読み込み中", tone: "muted" },
    { label: `検索 ${analysis.lastMs.toFixed(1)} ms`, tone: "muted" },
    ...(!textMode && session.stats.firstPartialMs !== null ? [{ label: `最初の途中結果 ${session.stats.firstPartialMs} ms`, tone: "muted" as const }] : []),
    ...(missing.length ? [{ label: `保存先未設定: ${missing.join(", ")}`, tone: "danger" as const }] : []),
    ...(mode === "rehearsal" ? [{ label: textMode ? "リハーサル（録音しません）" : "リハーサル（録音・保存します）", tone: "warn" as const }] : []),
    { label: engine === "azure" ? "文字起こし: Azure Speech" : `文字起こし: ${settings.stt.model}${engine === "compare" ? "（比較）" : "（確定文ごと）"}`, tone: engine === "azure" ? ("muted" as const) : ("warn" as const) },
    { label: `回答案: ${settings.answer.deployment || "既定"}`, tone: "muted" as const },
  ]

  return (
    <SourceProvider qa={corpus?.qa ?? NO_QA} ir={corpus?.ir ?? NO_IR}>
    <div className="agm flex h-dvh min-h-0 flex-col overflow-hidden">
      <TopBar
        meetingTitle={meeting?.title ?? MEETING_TITLE}
        onMeeting={() => setView("meeting")}
        live={{ active: !!live, viewers: live?.viewers.length ?? 0, onOpen: () => setLiveOpen(true) }}
        watchable={watchable}
        view={view}
        onView={setView}
        mode={mode}
        onMode={setMode}
        style={style}
        onStyle={setStyle}
        voiceCount={reader.voices.length}
        state={state}
        elapsedSec={sessionStart && state === "running" ? (now - sessionStart.getTime()) / 1000 : 0}
        turnCount={turns.filter((t) => numberOf(t)).length}
        stats={session.stats}
        showLevel={!textMode}
        disabledReason={disabledReason}
        onToggle={() => void toggle()}
        onCut={cutHere}
        status={status}
      />
      {review && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-agm-line bg-agm-raised px-5 py-2 text-sm" data-testid="review-banner">
          <span className="font-semibold text-agm-accent">振り返り中{state === "running" ? "（録音は続いています）" : ""}</span>
          <span>
            株主番号 <span className="font-mono">{review.turn.shareholderNumber}</span> {review.turn.shareholderName}
          </span>
          <span className="text-agm-muted">
            {new Date(review.turn.startedAt).toLocaleString("ja-JP")}・{review.turn.durationSec} 秒・{review.turn.saveStatus}
          </span>
          {review.turn.audioUrl && (
            <a href={review.turn.audioUrl} target="_blank" rel="noreferrer" className="text-agm-accent hover:underline">
              録音を開く
            </a>
          )}
          <button type="button" className="ml-auto rounded-md border border-agm-line px-3 py-1 text-agm-muted hover:text-agm-ink" onClick={() => setReview(null)}>
            {state === "running" ? "発言中の株主に戻る" : "閉じる"}
          </button>
        </div>
      )}
      {view === "settings" && (
        <div className="min-h-0 flex-1">
          <SettingsView />
        </div>
      )}
      {view === "meeting" && (
        <div className="min-h-0 flex-1">
          <MeetingView current={meeting} onUseMeeting={selectMeeting} refreshKey={meetingRefresh} />
        </div>
      )}
      {view === "watch" && (
        <div className="min-h-0 flex-1">
          <LiveWatch corpus={corpus} engine={analysis.engine} />
        </div>
      )}
      {view === "library" && (
        <div className="min-h-0 flex-1">
          <QaLibrary
            corpus={corpus}
            engine={libraryEngine}
            initialQuery={import.meta.env.VITE_DEV_LIBRARY_QUERY}
            source={corpusInfo.source === "local-demo" ? "同梱データ" : "Dataverse"}
            rowIds={qaRowIds.current}
            onSaved={(doc, rowId) => {
              qaRowIds.current.set(doc.id, rowId)
              setCorpus((c) => c && { ...c, qa: c.qa.some((q) => q.id === doc.id) ? c.qa.map((q) => (q.id === doc.id ? doc : q)) : [...c.qa, doc] })
              log.info("想定問答を画面に反映しました", { id: doc.id, status: doc.status })
            }}
          />
        </div>
      )}
      <main className={`${view !== "cockpit" ? "hidden" : "grid"} min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,2.3fr)] grid-rows-[minmax(0,1fr)_minmax(0,0.34fr)] gap-3 p-3`}>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <ShareholderPanel
            number={shownNumber}
            numberSource={review ? null : currentResolved.source}
            spokenName={review ? null : current.spokenName}
            cause={review ? null : current.cause}
            profile={shownProfile}
            loading={!!lookupNumber && loadingNumbers.has(lookupNumber)}
            heard={review ? null : current.heard}
            today={today}
            ident={review ? undefined : idents[current.key]}
            nameCandidates={!review && current.spokenName ? matchShareholders(roster.list, current.spokenName, 5) : undefined}
            onEditNumber={(v) => (review ? void editSavedTurn(review.turn.id, v) : editCurrentNumber(current.key, v))}
            onChoose={(s) => (review ? void editSavedTurn(review.turn.id, s.number) : editCurrentNumber(current.key, s.number))}
            onOpenPicker={() =>
              setPicker({ target: review ? { kind: "saved", id: review.turn.id } : { kind: "turn", key: current.key }, query: review ? review.turn.shareholderName : current.spokenName ?? "" })
            }
          />
          <div className="min-h-0 flex-1">
            <TranscriptPanel
              view={shownView}
              cards={shownCards}
              selectedId={selectedId}
              onSelect={(id) => select(id, "transcript")}
              listening={state === "running"}
              answerFrom={shownAnsFrom}
              title={shownNumber ? `株主番号 ${shownNumber}` : undefined}
            />
          </div>
        </div>
        <div ref={linksBox} className="relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-12">
          <div className="min-h-0 min-w-0">
            <QuestionCards
              cards={shownCards}
              selectedId={selectedId}
              onSelect={(id) => select(id, "card")}
              onAdopt={analysis.adopt}
              resetKey={review ? `review-${review.turn.id}` : current.key}
              registerRef={register(cardRefs)}
              scrollRef={(el) => {
                cardScroll.current = el
              }}
            />
          </div>
          <div className="min-h-0 min-w-0">
            <AnswersColumn
              cards={shownCards}
              engine={analysis.engine}
              gens={review ? undefined : generation.gens}
              onRegenerate={review ? undefined : generation.regenerate}
              resetKey={review ? `review-${review.turn.id}` : current.key}
              selectedId={selectedId}
              onSelect={(id) => select(id, "answer")}
              registerRef={register(answerRefs)}
              scrollRef={(el) => {
                answerScroll.current = el
              }}
            />
          </div>
          <CardAnswerLinks containerRef={linksBox} cardRefs={cardRefs} answerRefs={answerRefs} cardScroll={cardScroll} answerScroll={answerScroll} cards={shownCards} selectedId={selectedId} />
        </div>
        <div className="col-span-2 min-h-0 min-w-0">
          <RecordsPanel
            local={local}
            saved={saved}
            loading={loadingTurns}
            onReload={reloadTurns}
            reviewId={review?.turn.id}
            onReview={(id) => void openReview(id)}
            tab={bottomTab}
            onTab={setBottomTab}
            scriptView={
              <div className="flex h-full min-h-0 flex-col">
                <label className="flex items-center gap-2 border-b border-agm-line px-4 py-1.5 text-xs text-agm-muted">
                  台本
                  <select
                    value={script.id}
                    disabled={state === "running"}
                    onChange={(e) => {
                      setScriptId(e.target.value)
                      storeScriptId(e.target.value)
                    }}
                    className="h-7 min-w-0 max-w-md rounded border border-agm-line bg-agm-bg px-2 text-xs text-agm-ink"
                    data-testid="script-select"
                  >
                    {scripts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}（{s.lines.length} 行{s.createdVia && s.createdVia !== "同梱" ? `・${s.createdVia}` : ""}{s.status === "下書き" ? "・下書き" : ""}）
                      </option>
                    ))}
                  </select>
                  {script.note && <span className="truncate" title={script.note}>{script.note}</span>}
                </label>
                <div className="min-h-0 flex-1">
                  <ScriptPanel lines={SCRIPT} currentId={textMode ? text.currentId : reader.currentId} />
                </div>
              </div>
            }
            compareView={<SttComparePanel lines={session.lines} refined={refined} engine={engine} model={settings.stt.model} />}
            onEditNumber={editSavedTurn}
          />
        </div>
      </main>
      <LiveDialog
        open={liveOpen}
        onOpenChange={setLiveOpen}
        session={live}
        onSession={setLive}
        defaultTitle={`${meeting?.title ?? MEETING_TITLE} LIVE`}
        meetingId={meeting?.id}
        lastPublished={live ? lastPublished : null}
      />
      <ShareholderPicker
        open={!!picker}
        onOpenChange={(open) => !open && setPicker(null)}
        initialQuery={picker?.query}
        onSelect={(s) => {
          if (!picker) return
          if (picker.target.kind === "turn") editCurrentNumber(picker.target.key, s.number)
          else void editSavedTurn(picker.target.id, s.number)
        }}
      />
    </div>
    </SourceProvider>
  )
}
