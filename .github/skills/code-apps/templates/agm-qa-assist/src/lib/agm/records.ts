import { MicrosoftDataverseService } from "./services"
import { SharePointService } from "./services"
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, MEETING_DATE, MEETING_TITLE, SP_LIBRARY, SP_SITE_URL, col } from "./config"
import { errorText, listAll, withTimeout } from "./corpus"
import type { AnswerDraft, QuestionSegment } from "./types"

const log = createLogger("records")

type Row = Record<string, unknown>

export type StepState = "pending" | "running" | "done" | "failed" | "skipped"
export type SaveSteps = { audio: StepState; turn: StepState; questions: StepState }

export interface QuestionRecord {
  seq: number
  segment: QuestionSegment
  qaId?: string
  draft?: AnswerDraft
  adopted: boolean
  /** 生成した要約・回答案（あれば） */
  aiDraft?: string
  aiModel?: string
}

export interface TurnInput {
  shareholderNumber: string
  shareholderName: string
  startedAt: Date
  durationSec: number
  transcript: string
  audioDataUrl: string
  audioType: string
  rehearsal: boolean
  questions: QuestionRecord[]
  /** 株主名簿の行（見つかった場合） */
  shareholderRowId?: string
  /** 区切り方: 名乗った番号 / 手動 / 番号なし */
  detectedBy: string
  /** 「株主番号」の後ろで聞こえたまま */
  numberHeard?: string
}

export interface SavedTurn {
  turnId?: string
  audioUrl?: string
  audioFileName?: string
  steps: SaveSteps
  error?: string
}

let meetingIdPromise: Promise<string> | null = null
let selectedMeeting: { id: string; title: string } | null = null

/** 記録先の株主総会を切り替える（総会の画面で選んだもの） */
export function setRecordingMeeting(meeting: { id: string; title: string } | null) {
  selectedMeeting = meeting
  meetingIdPromise = null
}

export const recordingMeetingTitle = () => selectedMeeting?.title ?? MEETING_TITLE

async function createRow(entity: string, item: Row): Promise<Row> {
  const result = await withTimeout(MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", DATAVERSE_URL, entity, item), 30000, `${entity} の作成`)
  if (!result.success) throw new Error(`${entity} の作成に失敗しました: ${errorText(result.error)}`)
  return (result.data as unknown as Row) ?? {}
}

/** 総会レコードを名前で探し、無ければ作る（アプリの実行中は 1 回だけ問い合わせる） */
export function ensureMeeting(): Promise<string> {
  if (selectedMeeting && selectedMeeting.id !== "local") return Promise.resolve(selectedMeeting.id)
  meetingIdPromise ??= (async () => {
    const idCol = `${ENTITY.meeting.slice(0, -1)}id`
    const rows = await listAll(ENTITY.meeting, [idCol, col("name")])
    const found = rows.find((row) => row[col("name")] === MEETING_TITLE)
    if (found) return String(found[idCol])
    const created = await createRow(ENTITY.meeting, {
      [col("name")]: MEETING_TITLE,
      ...(MEETING_DATE ? { [col("meetingdate")]: MEETING_DATE } : {}),
    })
    log.info("総会レコードを作成しました", { title: MEETING_TITLE })
    return String(created[idCol])
  })().catch((error) => {
    meetingIdPromise = null
    throw error
  })
  return meetingIdPromise
}

const pad = (n: number) => String(n).padStart(2, "0")
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const safe = (value: string) => value.replace(/[\\/:*?"<>|#%\s]+/g, "_").slice(0, 40) || "unknown"

function extensionOf(type: string): string {
  if (type.includes("wav")) return "wav"
  if (type.includes("webm")) return "webm"
  if (type.includes("ogg")) return "ogg"
  if (type.includes("mp4")) return "m4a"
  return "bin"
}

/** 録音を SharePoint のライブラリへ株主番号ごとのフォルダーで保存する。本文は base64（SDK が binary に戻して送る） */
async function uploadAudio(input: TurnInput): Promise<{ url: string; fileName: string }> {
  const base64 = input.audioDataUrl.slice(input.audioDataUrl.indexOf(",") + 1)
  const fileName = `${stamp(input.startedAt)}_${safe(input.shareholderNumber)}.${extensionOf(input.audioType)}`
  const folderPath = `/${SP_LIBRARY}/${safe(recordingMeetingTitle())}/${safe(input.shareholderNumber || "番号なし")}`
  // SharePoint コネクタは dataset（サイト URL）を二重エンコードで受ける。SDK はパス引数を 1 回しか
  // エンコードしないため、先に 1 回エンコードして渡す（実測: 1 回だと 400 Route did not match）
  const call = (dataset: string) => withTimeout(SharePointService.CreateFile(dataset, folderPath, fileName, base64), 120000, "録音のアップロード")
  let result = await call(encodeURIComponent(SP_SITE_URL))
  if (!result.success && /Route did not match/i.test(errorText(result.error))) {
    log.warn("dataset の二重エンコードが合わないため、そのまま渡して再試行します")
    result = await call(SP_SITE_URL)
  }
  if (!result.success) throw new Error(`録音のアップロードに失敗しました: ${errorText(result.error)}`)
  const path = (result.data as { Path?: string } | undefined)?.Path ?? `${folderPath}/${fileName}`
  return { url: `${SP_SITE_URL.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`, fileName }
}

/**
 * 1 人の株主の発言を記録する。録音 → 発言 → 質問の順に保存し、段階ごとの状態を通知する。
 * 録音に失敗しても文字起こしと質問は残す（失敗は savestatus と画面に出す）。
 */
export async function saveTurn(input: TurnInput, qaRowIds: Map<string, string>, onStep: (steps: SaveSteps) => void): Promise<SavedTurn> {
  const steps: SaveSteps = { audio: input.audioDataUrl ? "running" : "skipped", turn: "pending", questions: "pending" }
  const notify = () => onStep({ ...steps })
  if (import.meta.env.VITE_DEV_LOCAL_CORPUS === "1") {
    // ホスト再現テスト用のビルド。コネクタが応答しないため保存しない
    const skipped: SaveSteps = { audio: "skipped", turn: "skipped", questions: "skipped" }
    onStep(skipped)
    log.info("テスト用ビルドのため保存しません", { number: input.shareholderNumber, questions: input.questions.length, audioKB: Math.round((input.audioDataUrl.length * 3) / 4 / 1024) })
    return { turnId: `local-${crypto.randomUUID()}`, steps: skipped, error: "テスト用ビルド（保存なし）" }
  }
  notify()
  const saved: SavedTurn = { steps }
  const errors: string[] = []

  if (input.audioDataUrl) {
    try {
      const audio = await uploadAudio(input)
      saved.audioUrl = audio.url
      saved.audioFileName = audio.fileName
      steps.audio = "done"
      log.info("録音を保存しました", { file: audio.fileName })
    } catch (error) {
      steps.audio = "failed"
      errors.push(errorText(error))
      log.error("録音の保存に失敗", error)
    }
    notify()
  }

  steps.turn = "running"
  notify()
  try {
    const meetingId = await ensureMeeting()
    const idCol = `${ENTITY.turn.slice(0, -1)}id`
    const status = [input.rehearsal ? "リハーサル" : "本番", input.detectedBy, steps.audio === "failed" ? "録音の保存に失敗" : steps.audio === "done" ? "録音保存済み" : "録音なし"].join(" / ")
    const turn = await createRow(ENTITY.turn, {
      [col("name")]: `${input.shareholderNumber} ${input.shareholderName}`.trim(),
      [col("shareholdernumber")]: input.shareholderNumber,
      [col("shareholdername")]: input.shareholderName,
      [col("startedat")]: input.startedAt.toISOString(),
      [col("endedat")]: new Date(input.startedAt.getTime() + input.durationSec * 1000).toISOString(),
      [col("durationsec")]: Math.round(input.durationSec),
      [col("transcript")]: input.transcript,
      [col("audiourl")]: saved.audioUrl ?? "",
      [col("audiofilename")]: saved.audioFileName ?? "",
      [col("savestatus")]: status,
      [col("numberheard")]: input.numberHeard ?? "",
      [`${col("meetingid")}@odata.bind`]: `/${ENTITY.meeting}(${meetingId})`,
      ...(input.shareholderRowId ? { [`${col("shareholderid")}@odata.bind`]: `/${ENTITY.shareholder}(${input.shareholderRowId})` } : {}),
    })
    saved.turnId = String(turn[idCol])
    steps.turn = "done"
  } catch (error) {
    steps.turn = "failed"
    steps.questions = "skipped"
    saved.error = [...errors, errorText(error)].join(" / ")
    log.error("発言の保存に失敗", error)
    notify()
    return saved
  }
  notify()

  steps.questions = input.questions.length ? "running" : "skipped"
  notify()
  try {
    for (const q of input.questions) {
      const qaRowId = q.qaId ? qaRowIds.get(q.qaId) : undefined
      await createRow(ENTITY.question, {
        [col("name")]: `Q${q.seq} ${q.segment.category}`.slice(0, 100),
        [col("seq")]: q.seq,
        [col("category")]: q.segment.category,
        [col("excerpt")]: q.segment.text,
        [col("qacode")]: q.qaId ?? "",
        [col("answerdraft")]: q.draft?.text ?? "",
        [col("citations")]: JSON.stringify(q.draft?.citations ?? []),
        [col("score")]: Number((q.segment.candidates[0]?.score ?? 0).toFixed(2)),
        [col("adopted")]: q.adopted,
        [col("unverifiednumbers")]: (q.draft?.unverified ?? []).join(" "),
        ...(q.aiDraft ? { [col("aidraft")]: q.aiDraft, [col("aimodel")]: q.aiModel ?? "" } : {}),
        [`${col("turnid")}@odata.bind`]: `/${ENTITY.turn}(${saved.turnId})`,
        ...(qaRowId ? { [`${col("qaid")}@odata.bind`]: `/${ENTITY.qa}(${qaRowId})` } : {}),
      })
    }
    if (input.questions.length) steps.questions = "done"
  } catch (error) {
    steps.questions = "failed"
    errors.push(errorText(error))
    log.error("質問の保存に失敗", error)
  }
  notify()
  if (errors.length) saved.error = errors.join(" / ")
  log.info("記録を保存しました", { turnId: saved.turnId, steps })
  return saved
}

/** 振り返り用に、発言に紐づく質問（採用した想定問答）を順番どおりに読む */
export async function listQuestionCodes(turnId: string): Promise<{ seq: number; qaCode: string; adopted: boolean }[]> {
  const result = await withTimeout(
    MicrosoftDataverseService.ListRecordsWithOrganization(
      DATAVERSE_URL,
      ENTITY.question,
      undefined,
      "application/json",
      undefined,
      undefined,
      [col("seq"), col("qacode"), col("adopted")].join(","),
      `_${col("turnid")}_value eq ${turnId}`,
      `${col("seq")} asc`,
    ),
    20000,
    "質問の取得",
  )
  if (!result.success) throw new Error(`質問の取得に失敗しました: ${errorText(result.error)}`)
  const rows = (result.data as { value?: Row[] } | undefined)?.value ?? []
  return rows.map((row) => ({ seq: Number(row[col("seq")] ?? 0), qaCode: String(row[col("qacode")] ?? ""), adopted: row[col("adopted")] === true }))
}

export interface TurnSummary {
  id: string
  shareholderNumber: string
  shareholderName: string
  startedAt: string
  durationSec: number
  audioUrl: string
  saveStatus: string
  transcript: string
  numberHeard: string
}

const TURN_COLUMNS = ["shareholdernumber", "shareholdername", "startedat", "durationsec", "audiourl", "savestatus", "transcript", "numberheard"]

function toTurnSummary(row: Row): TurnSummary {
  const idCol = `${ENTITY.turn.slice(0, -1)}id`
  return {
    id: String(row[idCol]),
    shareholderNumber: String(row[col("shareholdernumber")] ?? ""),
    shareholderName: String(row[col("shareholdername")] ?? ""),
    startedAt: String(row[col("startedat")] ?? ""),
    durationSec: Number(row[col("durationsec")] ?? 0),
    audioUrl: String(row[col("audiourl")] ?? ""),
    saveStatus: String(row[col("savestatus")] ?? ""),
    transcript: String(row[col("transcript")] ?? ""),
    numberHeard: String(row[col("numberheard")] ?? ""),
  }
}

/** 記録パネル用に、この総会（指定が無ければ全総会）の発言を新しい順に読む */
export async function listTurns(meetingId?: string): Promise<TurnSummary[]> {
  const idCol = `${ENTITY.turn.slice(0, -1)}id`
  const filter = meetingId && meetingId !== "local" ? `_${col("meetingid")}_value eq ${meetingId}` : undefined
  const rows = await listAll(ENTITY.turn, [idCol, ...TURN_COLUMNS.map(col)], `${col("startedat")} desc`, filter)
  return rows.map(toTurnSummary)
}

async function updateRow(entity: string, id: string, item: Row): Promise<void> {
  const result = await withTimeout(MicrosoftDataverseService.UpdateRecordWithOrganization("return=minimal", "application/json", DATAVERSE_URL, entity, id, item), 30000, `${entity} の更新`)
  if (!result.success) throw new Error(`${entity} の更新に失敗しました: ${errorText(result.error)}`)
}

/** 保存済みの発言の株主番号・氏名を後から直す（名簿の行が分かれば紐づけも直す） */
export async function updateTurnKeyInfo(turnId: string, info: { number: string; name: string; shareholderRowId?: string; note?: string }): Promise<void> {
  await updateRow(ENTITY.turn, turnId, {
    [col("name")]: `${info.number || "番号なし"} ${info.name}`.trim(),
    [col("shareholdernumber")]: info.number,
    [col("shareholdername")]: info.name,
    ...(info.shareholderRowId ? { [`${col("shareholderid")}@odata.bind`]: `/${ENTITY.shareholder}(${info.shareholderRowId})` } : {}),
    ...(info.note ? { [col("savestatus")]: info.note.slice(0, 100) } : {}),
  })
  log.info("発言の株主情報を修正しました", { turnId, number: info.number })
}

export interface QuestionSummary {
  id: string
  turnId: string
  seq: number
  category: string
  excerpt: string
  qaCode: string
  answerDraft: string
  aiDraft: string
  aiModel: string
  adopted: boolean
  unverified: string
  score: number
  rating: number
  ratingComment: string
}

/** 株主総会の質問をまとめて読む（発言 → 総会の紐づけで絞る） */
export async function listMeetingQuestions(meetingId: string): Promise<QuestionSummary[]> {
  const idCol = `${ENTITY.question.slice(0, -1)}id`
  const cols = ["seq", "category", "excerpt", "qacode", "answerdraft", "aidraft", "aimodel", "adopted", "unverifiednumbers", "score", "rating", "ratingcomment"]
  const filter = meetingId && meetingId !== "local" ? `${col("turnid")}/_${col("meetingid")}_value eq ${meetingId}` : undefined
  const rows = await listAll(ENTITY.question, [idCol, `_${col("turnid")}_value`, ...cols.map(col)], `${col("seq")} asc`, filter)
  return rows.map((r) => ({
    id: String(r[idCol]),
    turnId: String(r[`_${col("turnid")}_value`] ?? ""),
    seq: Number(r[col("seq")] ?? 0),
    category: String(r[col("category")] ?? ""),
    excerpt: String(r[col("excerpt")] ?? ""),
    qaCode: String(r[col("qacode")] ?? ""),
    answerDraft: String(r[col("answerdraft")] ?? ""),
    aiDraft: String(r[col("aidraft")] ?? ""),
    aiModel: String(r[col("aimodel")] ?? ""),
    adopted: r[col("adopted")] === true,
    unverified: String(r[col("unverifiednumbers")] ?? ""),
    score: Number(r[col("score")] ?? 0),
    rating: Number(r[col("rating")] ?? 0),
    ratingComment: String(r[col("ratingcomment")] ?? ""),
  }))
}

/** 回答案の評価（1〜5、コメント）を保存する */
export async function rateQuestion(questionId: string, rating: number, comment: string): Promise<void> {
  await updateRow(ENTITY.question, questionId, { [col("rating")]: rating, [col("ratingcomment")]: comment })
}

/** まとめのファイル（Markdown / CSV）を総会のフォルダーへ保存する */
export async function uploadMeetingFile(meetingTitle: string, fileName: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  const base64 = btoa(binary)
  const folderPath = `/${SP_LIBRARY}/${safe(meetingTitle)}`
  const result = await withTimeout(SharePointService.CreateFile(encodeURIComponent(SP_SITE_URL), folderPath, fileName, base64), 120000, "まとめの保存")
  if (!result.success) throw new Error(`まとめを保存できません: ${errorText(result.error)}`)
  const path = (result.data as { Path?: string } | undefined)?.Path ?? `${folderPath}/${fileName}`
  return `${SP_SITE_URL.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`
}