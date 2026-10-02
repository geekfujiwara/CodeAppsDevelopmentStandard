import { MicrosoftDataverseService } from "./services"
import { createLogger } from "@/lib/debug-log"
import { DATAVERSE_URL, ENTITY, MEETING_DATE, MEETING_TITLE, col } from "./config"
import { errorText, listAll, withTimeout } from "./corpus"

const log = createLogger("meeting")

export interface Meeting {
  id: string
  title: string
  date: string
  summaryUrl: string
}

const STORAGE_KEY = "agm-current-meeting"
const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"
const idCol = () => `${ENTITY.meeting.slice(0, -1)}id`

export async function listMeetings(): Promise<Meeting[]> {
  if (localMode()) return [{ id: "local", title: MEETING_TITLE, date: MEETING_DATE, summaryUrl: "" }]
  const rows = await listAll(ENTITY.meeting, [idCol(), col("name"), col("meetingdate"), col("summaryurl")], `${col("meetingdate")} desc`)
  return rows.map((r) => ({
    id: String(r[idCol()]),
    title: String(r[col("name")] ?? ""),
    date: String(r[col("meetingdate")] ?? "").slice(0, 10),
    summaryUrl: String(r[col("summaryurl")] ?? ""),
  }))
}

export async function createMeeting(title: string, date: string): Promise<Meeting> {
  const result = await withTimeout(
    MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", DATAVERSE_URL, ENTITY.meeting, {
      [col("name")]: title,
      ...(date ? { [col("meetingdate")]: date } : {}),
    }),
    30000,
    "株主総会の作成",
  )
  if (!result.success) throw new Error(`株主総会を作成できません: ${errorText(result.error)}`)
  const row = (result.data as unknown as Record<string, unknown>) ?? {}
  log.info("株主総会を作成しました", { title, date })
  return { id: String(row[idCol()]), title, date, summaryUrl: "" }
}

export async function updateMeeting(id: string, item: Record<string, unknown>): Promise<void> {
  const result = await withTimeout(MicrosoftDataverseService.UpdateRecordWithOrganization("return=minimal", "application/json", DATAVERSE_URL, ENTITY.meeting, id, item), 30000, "株主総会の更新")
  if (!result.success) throw new Error(`株主総会を更新できません: ${errorText(result.error)}`)
}

/** 今記録している総会（端末に覚えておく。無ければ .env の総会名） */
export function storedMeetingId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeMeetingId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 保存できない環境では毎回 .env の総会を使う
  }
}
