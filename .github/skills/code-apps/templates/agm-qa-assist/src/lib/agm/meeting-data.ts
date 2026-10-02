import { listMeetingQuestions, listTurns, rateQuestion } from "./records"
import type { StatQuestion, StatTurn } from "./meeting-stats"

const localMode = () => import.meta.env.VITE_DEV_LOCAL_CORPUS === "1"

export interface MeetingData {
  turns: StatTurn[]
  questions: StatQuestion[]
  source: "dataverse" | "local-demo"
}

/** 総会の発言と質問をまとめて読む。テスト用ビルドでは同梱の過去の総会（デモ）を使う */
export async function loadMeetingData(meetingId: string): Promise<MeetingData> {
  if (localMode()) {
    const demo = (await import("../../../data/demo/shareholder-history.json")).default as {
      turns: { code: string; shareholderNumber: string; startedAt: string; durationSec: number; questions: { seq: number; category: string; excerpt: string; qaCode: string }[] }[]
    }
    const holders = (await import("../../../data/demo/shareholders.json")).default as { number: string; name: string }[]
    return {
      source: "local-demo",
      turns: demo.turns.map((t) => ({ id: t.code, shareholderNumber: t.shareholderNumber, shareholderName: holders.find((h) => h.number === t.shareholderNumber)?.name ?? "", startedAt: t.startedAt, durationSec: t.durationSec })),
      questions: demo.turns.flatMap((t) =>
        t.questions.map((q) => ({ id: `${t.code}-${q.seq}`, turnId: t.code, seq: q.seq, category: q.category, excerpt: q.excerpt, qaCode: q.qaCode, aiDraft: "", answerDraft: "", rating: 0, ratingComment: "" })),
      ),
    }
  }
  const [turns, questions] = await Promise.all([listTurns(meetingId), listMeetingQuestions(meetingId)])
  return { source: "dataverse", turns, questions }
}

export async function saveRating(questionId: string, rating: number, comment: string): Promise<void> {
  if (localMode()) return
  await rateQuestion(questionId, rating, comment)
}
