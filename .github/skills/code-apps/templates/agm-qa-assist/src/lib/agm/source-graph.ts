// 生成した回答案の各行が、どの検索結果（想定問答・IR 抜粋）を引用しているかを線で結ぶためのグラフ。
// 画面に依存しない純粋関数だけを置く（React Flow のノード・エッジへの変換は source-flow.tsx）。
import { citedIds, splitSections } from './generated.ts';

export interface AnswerLine {
  key: string;
  part: 'summary' | 'answer' | 'note';
  text: string;
  cites: string[];
}

/** 生成文を行（要約の箇条・回答案・補足）に分け、行ごとの引用 ID を取る。生成途中でも崩れない */
export function answerLines(text: string): AnswerLine[] {
  const s = splitSections(text);
  return [
    ...s.summary.map((t, i) => ({ key: `s${i}`, part: 'summary' as const, text: t, cites: citedIds(t) })),
    ...(s.answer ? [{ key: 'a', part: 'answer' as const, text: s.answer, cites: citedIds(s.answer) }] : []),
    ...s.notes.map((t, i) => ({ key: `n${i}`, part: 'note' as const, text: t, cites: citedIds(t) })),
  ];
}

export interface SourceUse {
  /** 引用した回答の行のキー */
  lines: string[];
  count: number;
}

export interface SourceLinks {
  /** 渡した根拠ごとの引用（引用されなかった根拠は lines が空） */
  uses: Map<string, SourceUse>;
  /** 渡した根拠のうち、どの行にも引用されなかったもの */
  uncited: string[];
  /** 渡していない ID を引用している（生成の誤り。要確認） */
  unknown: string[];
  /** 根拠と回答の行を結ぶ線 */
  links: { from: string; to: string }[];
}

export function sourceLinks(sourceIds: string[], lines: AnswerLine[]): SourceLinks {
  const uses = new Map<string, SourceUse>(sourceIds.map((id) => [id, { lines: [], count: 0 }]));
  const unknown = new Set<string>();
  const links: { from: string; to: string }[] = [];
  for (const line of lines) {
    for (const id of line.cites) {
      const use = uses.get(id);
      if (!use) {
        unknown.add(id);
        continue;
      }
      use.count += 1;
      if (!use.lines.includes(line.key)) {
        use.lines.push(line.key);
        links.push({ from: id, to: line.key });
      }
    }
  }
  return { uses, uncited: sourceIds.filter((id) => !uses.get(id)!.count), unknown: [...unknown], links };
}

export interface LayoutInput {
  qa: { id: string; sourceIds: string[] }[];
  ir: { id: string }[];
}

export interface Placed {
  id: string;
  x: number;
  y: number;
}

/** 検索語 → 想定問答 → 回答案 ← IR 抜粋（根拠を回答案の左右に置き、線がノードの上を横切らないようにする） */
export const COLUMN_X = { query: 0, qa: 290, answer: 680, ir: 1340 } as const;
export const ANSWER_WIDTH = 580;
const QA_GAP = 160;
const IR_GAP = 160;

/**
 * 列ごとに縦に並べる（検索語 → 想定問答 → 回答案 ← IR 抜粋）。IR は、参照している想定問答の順に並べて線の交差を減らす。
 */
export function layoutColumns(input: LayoutInput): { query: Placed; qa: Placed[]; ir: Placed[]; answer: Placed } {
  const order = new Map<string, number>();
  input.qa.forEach((q, i) => q.sourceIds.forEach((id) => (order.has(id) ? undefined : order.set(id, i))));
  const ir = [...input.ir].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const qaHeight = Math.max(0, input.qa.length - 1) * QA_GAP;
  const irHeight = Math.max(0, ir.length - 1) * IR_GAP;
  const top = Math.max(qaHeight, irHeight);
  return {
    query: { id: 'query', x: COLUMN_X.query, y: top / 2 },
    qa: input.qa.map((q, i) => ({ id: q.id, x: COLUMN_X.qa, y: (top - qaHeight) / 2 + i * QA_GAP })),
    ir: ir.map((d, i) => ({ id: d.id, x: COLUMN_X.ir, y: (top - irHeight) / 2 + i * IR_GAP })),
    answer: { id: 'answer', x: COLUMN_X.answer, y: Math.max(0, top / 2 - 160) },
  };
}
