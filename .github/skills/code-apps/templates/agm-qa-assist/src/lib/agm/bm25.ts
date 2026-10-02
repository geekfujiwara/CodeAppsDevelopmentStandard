import { tokenize } from './text.ts';
import type { Hit } from './types.ts';

export interface Field {
  text: string;
  weight: number;
}

interface Posting {
  docIndex: number;
  tf: number;
}

const K1 = 1.2;
const B = 0.75;

/** 語・数値の一致は 2 文字 gram より強く効かせる（gram は表記ゆれの救済用） */
function termBoost(term: string): number {
  if (term.startsWith('=')) {
    return 2.0;
  }
  if (term.startsWith('#')) {
    return 0.6;
  }
  return 1.0;
}

/**
 * フィールド重み付きの BM25。文書数が数百件までならブラウザのメモリ内で 1 ms 前後で引ける。
 */
export class Bm25Index<T> {
  private readonly docs: T[] = [];
  private readonly lengths: number[] = [];
  private readonly postings = new Map<string, Posting[]>();
  private avgLength = 0;

  constructor(docs: T[], fields: (doc: T) => Field[]) {
    let total = 0;
    docs.forEach((doc, docIndex) => {
      const tf = new Map<string, number>();
      let length = 0;
      for (const field of fields(doc)) {
        for (const term of tokenize(field.text)) {
          tf.set(term, (tf.get(term) ?? 0) + field.weight);
          length += field.weight;
        }
      }
      for (const [term, freq] of tf) {
        const list = this.postings.get(term) ?? [];
        list.push({ docIndex, tf: freq });
        this.postings.set(term, list);
      }
      this.docs.push(doc);
      this.lengths.push(length);
      total += length;
    });
    this.avgLength = docs.length ? total / docs.length : 0;
  }

  get size(): number {
    return this.docs.length;
  }

  private idf(term: string): number {
    const df = this.postings.get(term)?.length ?? 0;
    return Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
  }

  search(query: string, limit = 5): Hit<T>[] {
    const terms = [...new Set(tokenize(query))];
    const scores = new Map<number, { score: number; matched: Set<string> }>();
    for (const term of terms) {
      const list = this.postings.get(term);
      if (!list) {
        continue;
      }
      const idf = this.idf(term) * termBoost(term);
      for (const { docIndex, tf } of list) {
        const norm = tf + K1 * (1 - B + B * (this.lengths[docIndex] / this.avgLength));
        const entry = scores.get(docIndex) ?? { score: 0, matched: new Set<string>() };
        entry.score += idf * ((tf * (K1 + 1)) / norm);
        if (!term.startsWith('#')) {
          entry.matched.add(term.replace(/^=/, ''));
        }
        scores.set(docIndex, entry);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([docIndex, { score, matched }]) => ({ doc: this.docs[docIndex], score, matched: [...matched] }));
  }
}
