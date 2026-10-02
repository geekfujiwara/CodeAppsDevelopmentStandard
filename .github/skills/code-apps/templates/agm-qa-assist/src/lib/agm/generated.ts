import { findNumber } from './engine.ts';
import { extractClaims } from './text.ts';

export interface GeneratedSections {
  summary: string[];
  answer: string;
  notes: string[];
}

const HEADINGS = ['【要約】', '【回答案】', '【補足・注意】'] as const;

/** 生成中の途中の文字列でも崩れないように、見出しで区切って取り出す */
export function splitSections(text: string): GeneratedSections {
  const pos = HEADINGS.map((h) => text.indexOf(h));
  const body = (i: number) => {
    if (pos[i] < 0) return '';
    const start = pos[i] + HEADINGS[i].length;
    const ends = pos.filter((p, j) => j !== i && p > pos[i]);
    return text.slice(start, ends.length ? Math.min(...ends) : text.length).trim();
  };
  const bullets = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-・*]\s*/, '').trim())
      .filter(Boolean);
  // 見出しがまだ出ていない最初の部分は要約として扱う
  const summaryText = pos[0] >= 0 ? body(0) : pos.every((p) => p < 0) ? text.trim() : '';
  return { summary: bullets(summaryText), answer: body(1), notes: bullets(body(2)) };
}

export const CITE = /\[((?:QA|IR)-\d+)\]/g;

export function citedIds(text: string): string[] {
  return [...new Set([...text.matchAll(CITE)].map((m) => m[1]))];
}

/** 生成文の数値のうち、渡した根拠のどこにも無いもの（要確認として表示する） */
export function unverifiedClaims(text: string, sources: string[]): string[] {
  return extractClaims(text).filter((claim) => !sources.some((s) => findNumber(s, claim)));
}
