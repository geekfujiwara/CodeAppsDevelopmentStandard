import type { Shareholder } from './shareholders.ts';
import { spokenDigits } from './turns.ts';

export interface Candidate {
  shareholder: Shareholder;
  numberScore: number;
  nameScore: number;
  score: number;
}

/** 文字の違い（全角・半角、カタカナ・ひらがな、空白）を寄せて比べる */
export function foldName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .toLowerCase()
}

/** 名簿のうち、名前・フリガナ・番号が検索語を含むもの（番号を言わない株主を、名乗った名前から探す） */
export function matchShareholders(all: Shareholder[], query: string, limit = 20): Shareholder[] {
  const q = foldName(query)
  if (!q) return all.slice(0, limit)
  const scored = all
    .map((s) => {
      const name = foldName(s.name)
      const kana = foldName(s.kana)
      const score = name.startsWith(q) ? 3 : kana.startsWith(q) ? 2.5 : name.includes(q) || kana.includes(q) ? 2 : s.number.includes(q) ? 1 : 0
      return { s, score }
    })
    .filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score || a.s.number.localeCompare(b.s.number))
  return scored.slice(0, limit).map((x) => x.s)
}

/** 名乗りの発言から名前らしい部分（「〜です」「〜と申します」の直前）を取る */
export function introName(text: string): string | null {
  const t = text.normalize("NFKC")
  const m = /(?:^|[のは、。,\s])([^\s、。,0-9番の]{1,8}?)(?:です|と申します|でございます)/.exec(t)
  return m ? m[1] : null
}

function lcs(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[a.length][b.length]
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1))
      last = tmp
    }
  }
  return prev[b.length]
}

/** 番号の近さ（0〜1）。区切られた・余分な数字が混ざった認識（「200。3 16」と 236）も、数字の並びで拾う */
export function numberSimilarity(candidate: string, digits: string): number {
  if (!digits) return 0
  const c = candidate.replace(/^0+(?=\d)/, "")
  const d = digits.replace(/^0+(?=\d)/, "")
  if (c === d) return 1
  const subsequence = (lcs(c, d) / c.length) * (d.length > c.length ? 0.9 : 1) - (c.length > d.length ? 0.15 * (c.length - d.length) : 0)
  const edit = 1 - levenshtein(c, d) / Math.max(c.length, d.length)
  return Math.max(0, Math.min(1, Math.max(subsequence, edit)))
}

function bigrams(s: string): string[] {
  return s.length < 2 ? [s] : Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))
}

/** 名前の近さ（0〜1）。漢字の氏名と、フリガナ（ひらがなに寄せて）の両方で比べる */
export function nameSimilarity(spoken: string | null, s: Shareholder): number {
  if (!spoken) return 0
  const q = foldName(spoken)
  const name = foldName(s.name)
  const kana = foldName(s.kana)
  if (!q) return 0
  if (name.startsWith(q) || q.startsWith(name)) return 1
  if (kana.startsWith(q)) return 0.95
  const dice = (a: string, b: string) => {
    const x = bigrams(a)
    const y = bigrams(b)
    const hit = x.filter((g) => y.includes(g)).length
    return (2 * hit) / (x.length + y.length)
  }
  return Math.max(dice(q, name.slice(0, q.length + 1)), dice(q, kana.slice(0, q.length + 1)), name.includes(q) ? 0.8 : 0)
}

/** 名簿から照合の候補を選ぶ（番号と名前の近さ）。生成 AI にはこの上位だけを渡す */
export function shortlist(register: Shareholder[], utterance: string, limit = 20): Candidate[] {
  const digits = spokenDigits(utterance.replace(/^.*?株主番号/, ""))
  const name = introName(utterance)
  const scored = register.map((s) => {
    const numberScore = numberSimilarity(s.number, digits)
    const nameScore = nameSimilarity(name, s)
    const score = digits && name ? 0.55 * numberScore + 0.45 * nameScore : digits ? numberScore : nameScore
    return { shareholder: s, numberScore, nameScore, score }
  })
  return scored
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}


/**
 * 選んだ株主と見分けがつかない候補（同じ名字で番号も近い、または名前が無く番号が同じくらい近い）。
 * 例: 「株主番号を200。3 16番の藤原です」は 0236 藤原と 2036 藤原のどちらとも読める。生成 AI の答えが揺れるため、
 * こうした候補がいるときは確からしさに関係なく自動で決めず、担当者に選んでもらう。
 */
export function rivalsOf(chosen: string | null, candidates: Candidate[]): Candidate[] {
  const c = candidates.find((x) => x.shareholder.number === chosen)
  if (!c) return []
  return candidates.filter((x) => {
    if (x === c || c.numberScore >= 1) return false
    if (c.nameScore >= 0.9) return x.nameScore >= 0.9 && x.numberScore >= c.numberScore - 0.15
    return x.numberScore >= c.numberScore - 0.05
  })
}