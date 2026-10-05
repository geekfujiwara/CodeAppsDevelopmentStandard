// リハーサル台本（Dataverse の台本テーブル）。Copilot Studio・Cowork・アプリで作った台本を選んで、読み上げ・文字だけ再生に使う
import { createLogger } from "@/lib/debug-log"
import type { ScriptLine } from "@/hooks/use-rehearsal"
import { DATAVERSE_URL, ENTITY, col } from "./config"
import { errorText, listAll, withTimeout } from "./corpus"
import { MicrosoftDataverseService } from "./services"
import demo from "../../../data/demo/rehearsal-script.json"
import { parseLines } from "./script-lines"
export { parseLines } from "./script-lines"

const log = createLogger("scripts")
const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"
const STORE_KEY = "agm-script-selected"

export interface RehearsalScript {
  id: string
  title: string
  lines: ScriptLine[]
  note: string
  status: string
  createdVia: string
}

export const DEMO_SCRIPT: RehearsalScript = { id: "demo", title: `${(demo as { title?: string }).title ?? "デモ台本"}（同梱）`, lines: (demo as { lines: ScriptLine[] }).lines, note: (demo as { note?: string }).note ?? "", status: "承認済み", createdVia: "同梱" }

/** 台本の一覧（同梱のデモ台本は常に先頭に置く） */
export async function listScripts(): Promise<RehearsalScript[]> {
  if (localMode()) return [DEMO_SCRIPT]
  const idCol = `${ENTITY.script.slice(0, -1)}id`
  const rows = await listAll(ENTITY.script, [idCol, ...["name", "lines", "note", "status", "createdvia"].map(col), "modifiedon"], "modifiedon desc")
  const scripts = rows
    .map((r) => {
      const { lines, dropped, repaired } = parseLines(String(r[col("lines")] ?? ""))
      if (dropped) log.warn("台本の行の一部を読めませんでした", { title: r[col("name")], dropped })
      if (repaired) log.warn("台本の JSON が崩れていたため直して読みました（Copilot Studio・Cowork で作った台本は保存し直すと直ります）", { title: r[col("name")], lines: lines.length })
      if (!lines.length) log.warn("台本の JSON を読めないため一覧から外しました", { title: r[col("name")] })
      return { id: String(r[idCol]), title: String(r[col("name")] ?? ""), lines, note: String(r[col("note")] ?? ""), status: String(r[col("status")] ?? ""), createdVia: String(r[col("createdvia")] ?? "") }
    })
    .filter((s) => s.lines.length)
  return [DEMO_SCRIPT, ...scripts]
}

export const storedScriptId = () => localStorage.getItem(STORE_KEY) ?? DEMO_SCRIPT.id
export const storeScriptId = (id: string) => localStorage.setItem(STORE_KEY, id)

/** 台本を保存する（アプリから作るとき。Copilot Studio・Cowork は Dataverse MCP で直接作る） */
export async function createScript(title: string, lines: ScriptLine[], note = ""): Promise<string> {
  const r = await withTimeout(
    MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", DATAVERSE_URL, ENTITY.script, {
      [col("name")]: title,
      [col("lines")]: JSON.stringify(lines),
      [col("note")]: note,
      [col("status")]: "下書き",
      [col("createdvia")]: "アプリ",
    }),
    20000,
    "台本の保存",
  )
  if (!r.success) throw new Error(`台本を保存できません: ${errorText(r.error)}`)
  return String(((r.data as unknown as Record<string, unknown>) ?? {})[`${ENTITY.script.slice(0, -1)}id`] ?? "")
}
