// 株主総会ごとの集計（ダッシュボードとまとめの出力）。画面・通信に依存しない純粋関数だけを置く。

export interface StatTurn {
  id: string
  shareholderNumber: string
  shareholderName: string
  startedAt: string
  durationSec: number
  audioUrl?: string
}

export interface StatQuestion {
  id: string
  turnId: string
  seq: number
  category: string
  excerpt: string
  qaCode: string
  aiDraft: string
  answerDraft: string
  rating: number
  ratingComment: string
}

export interface MeetingStats {
  turns: number
  shareholders: number
  questions: number
  unidentified: number
  matched: number
  novel: number
  aiDrafts: number
  rated: number
  averageRating: number | null
  totalMinutes: number
  byCategory: { category: string; count: number }[]
  byTime: { slot: string; count: number }[]
  ratings: { rating: string; count: number }[]
  topShareholders: { number: string; name: string; questions: number }[]
}

const pad = (n: number) => String(n).padStart(2, "0")

/** 時間帯（slotMinutes 分刻み、端末の時刻）。日付が読めなければ「不明」 */
export function timeSlot(iso: string, slotMinutes = 15): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "不明"
  const m = Math.floor(d.getMinutes() / slotMinutes) * slotMinutes
  return `${pad(d.getHours())}:${pad(m)}`
}

export function meetingStats(turns: StatTurn[], questions: StatQuestion[], slotMinutes = 15): MeetingStats {
  const turnById = new Map(turns.map((t) => [t.id, t]))
  const count = <K>(items: K[]) => {
    const m = new Map<K, number>()
    for (const k of items) m.set(k, (m.get(k) ?? 0) + 1)
    return m
  }
  const rated = questions.filter((q) => q.rating > 0)
  const perHolder = count(questions.map((q) => turnById.get(q.turnId)?.shareholderNumber ?? "").filter(Boolean))
  return {
    turns: turns.length,
    shareholders: new Set(turns.map((t) => t.shareholderNumber).filter(Boolean)).size,
    questions: questions.length,
    unidentified: turns.filter((t) => !t.shareholderNumber).length,
    matched: questions.filter((q) => q.qaCode).length,
    novel: questions.filter((q) => !q.qaCode).length,
    aiDrafts: questions.filter((q) => q.aiDraft).length,
    rated: rated.length,
    averageRating: rated.length ? Math.round((rated.reduce((s, q) => s + q.rating, 0) / rated.length) * 10) / 10 : null,
    totalMinutes: Math.round(turns.reduce((s, t) => s + (t.durationSec || 0), 0) / 6) / 10,
    byCategory: [...count(questions.map((q) => q.category || "未分類")).entries()].map(([category, n]) => ({ category, count: n })).sort((a, b) => b.count - a.count),
    byTime: [...count(questions.map((q) => timeSlot(turnById.get(q.turnId)?.startedAt ?? "", slotMinutes))).entries()]
      .map(([slot, n]) => ({ slot, count: n }))
      .sort((a, b) => a.slot.localeCompare(b.slot)),
    ratings: [1, 2, 3, 4, 5].map((r) => ({ rating: `${r}`, count: rated.filter((q) => q.rating === r).length })),
    topShareholders: [...perHolder.entries()]
      .map(([number, n]) => ({ number, name: turns.find((t) => t.shareholderNumber === number)?.shareholderName ?? "", questions: n }))
      .sort((a, b) => b.questions - a.questions)
      .slice(0, 5),
  }
}

const csvCell = (v: string | number) => {
  const s = String(v ?? "")
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** 質問ごとの CSV（Excel で開けるよう BOM を付ける） */
export function questionsCsv(turns: StatTurn[], questions: StatQuestion[]): string {
  const turnById = new Map(turns.map((t) => [t.id, t]))
  const header = ["株主番号", "氏名", "発言開始", "質問番号", "分類", "質問の要旨", "想定問答", "評価", "評価コメント", "AI 回答案"]
  const rows = questions
    .map((q) => ({ q, t: turnById.get(q.turnId) }))
    .sort((a, b) => (a.t?.startedAt ?? "").localeCompare(b.t?.startedAt ?? "") || a.q.seq - b.q.seq)
    .map(({ q, t }) => [t?.shareholderNumber ?? "", t?.shareholderName ?? "", t?.startedAt ?? "", q.seq, q.category, q.excerpt, q.qaCode || "（新規）", q.rating || "", q.ratingComment, q.aiDraft.replace(/\s+/g, " ").slice(0, 2000)])
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

/** 総会のまとめ（Markdown）。株主番号ごとに発言と質問・回答案・評価を並べる */
export function meetingMarkdown(title: string, date: string, turns: StatTurn[], questions: StatQuestion[], generatedAt = new Date()): string {
  const s = meetingStats(turns, questions)
  const lines = [
    `# ${title} 質疑応答の記録`,
    "",
    `- 開催日: ${date || "未設定"}`,
    `- 作成: ${generatedAt.toLocaleString("ja-JP")}`,
    `- 発言 ${s.turns} 件（株主 ${s.shareholders} 名、番号未確認 ${s.unidentified} 件）・質問 ${s.questions} 件・合計 ${s.totalMinutes} 分`,
    `- 想定問答に一致 ${s.matched} 件 / 新規 ${s.novel} 件・AI 回答案 ${s.aiDrafts} 件・平均評価 ${s.averageRating ?? "未評価"}`,
    "",
    "## 分類別の質問数",
    "",
    "| 分類 | 件数 |",
    "|---|---:|",
    ...s.byCategory.map((c) => `| ${c.category} | ${c.count} |`),
    "",
    "## 発言の記録",
  ]
  const sorted = [...turns].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const t of sorted) {
    const when = Number.isNaN(new Date(t.startedAt).getTime()) ? t.startedAt : new Date(t.startedAt).toLocaleTimeString("ja-JP")
    lines.push("", `### 株主番号 ${t.shareholderNumber || "未確認"} ${t.shareholderName}（${when}・${Math.round(t.durationSec)} 秒）`)
    if (t.audioUrl) lines.push("", `録音: ${t.audioUrl}`)
    for (const q of questions.filter((x) => x.turnId === t.id).sort((a, b) => a.seq - b.seq)) {
      lines.push("", `#### Q${q.seq}【${q.category}】${q.excerpt}`, "", `- 想定問答: ${q.qaCode || "なし（新規の質問）"}`)
      if (q.rating) lines.push(`- 評価: ${"★".repeat(q.rating)}${"☆".repeat(5 - q.rating)}${q.ratingComment ? `（${q.ratingComment}）` : ""}`)
      const answer = q.aiDraft || q.answerDraft
      if (answer) lines.push("", ...answer.split("\n").map((l) => `> ${l}`))
    }
  }
  return lines.join("\n") + "\n"
}
