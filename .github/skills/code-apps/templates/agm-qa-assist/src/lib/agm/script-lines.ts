// 台本の行（JSON）の検証（純粋関数）
import type { ScriptLine } from '../../hooks/use-rehearsal.ts'

const ROLES = new Set(["chair", "shareholder", "officer"])

/** 先頭の `[` から対応する `]` までを取り出す（文字列内の括弧は数えない）。見つからなければ null */
function firstArray(raw: string): string | null {
  const start = raw.indexOf("[")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "[") depth++
    else if (ch === "]" && --depth === 0) return raw.slice(start, i + 1)
  }
  return null
}

/** 生成 AI が作った JSON の小さな崩れ（配列の後ろの余分な文字・1 行 1 オブジェクトの形式）を読めるようにする */
function lenientParse(raw: string): { value: unknown; repaired: boolean } | null {
  try {
    return { value: JSON.parse(raw), repaired: false }
  } catch {
    // 下で崩れの直しを試す
  }
  const array = firstArray(raw)
  if (array) {
    try {
      return { value: JSON.parse(array), repaired: true }
    } catch {
      // 1 行 1 オブジェクトの形式を試す
    }
  }
  const objects = raw.split(/\r?\n/).map((s) => s.trim().replace(/,$/, "")).filter((s) => s.startsWith("{"))
  if (objects.length) {
    try {
      return { value: objects.map((s) => JSON.parse(s)), repaired: true }
    } catch {
      return null
    }
  }
  return null
}

/** JSON の行を検証して台本の行にする（Copilot Studio・Cowork が作った行の役・本文の欠けを落とす） */
export function parseLines(raw: string): { lines: ScriptLine[]; dropped: number; repaired: boolean } {
  const parsedResult = lenientParse(raw)
  if (!parsedResult) return { lines: [], dropped: 0, repaired: false }
  const parsed = parsedResult.value
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
  return { lines, dropped: arr.length - lines.length, repaired: parsedResult.repaired }
}

