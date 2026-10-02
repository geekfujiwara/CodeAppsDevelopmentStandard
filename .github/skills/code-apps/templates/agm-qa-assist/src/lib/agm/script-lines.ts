// 台本の行（JSON）の検証（純粋関数）
import type { ScriptLine } from '../../hooks/use-rehearsal.ts'

const ROLES = new Set(["chair", "shareholder", "officer"])

/** JSON の行を検証して台本の行にする（Cowork が作った行の役・本文の欠けを落とす） */
export function parseLines(raw: string): { lines: ScriptLine[]; dropped: number } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { lines: [], dropped: 0 }
  }
  const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { lines?: unknown })?.lines) ? (parsed as { lines: unknown[] }).lines : []
  const lines: ScriptLine[] = []
  for (const [i, item] of arr.entries()) {
    const l = item as Partial<ScriptLine>
    if (!l || typeof l.text !== "string" || !l.text.trim() || !ROLES.has(String(l.role))) continue
    lines.push({
      id: typeof l.id === "string" && l.id ? l.id : `L${String(i + 1).padStart(2, "0")}`,
      role: l.role as ScriptLine["role"],
      speaker: typeof l.speaker === "string" && l.speaker ? l.speaker : l.role === "chair" ? "議長" : l.role === "officer" ? "回答者" : "株主",
      number: typeof l.number === "string" && /^\d{1,8}$/.test(l.number) ? l.number : undefined,
      voice: typeof l.voice === "string" ? l.voice : undefined,
      text: l.text.trim(),
    })
  }
  return { lines, dropped: arr.length - lines.length }
}

