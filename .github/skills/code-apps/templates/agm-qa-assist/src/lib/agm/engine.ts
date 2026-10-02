import { Bm25Index } from './bm25.ts';
import { extractClaims, normalize, stripFillers } from './text.ts';
import type { AnswerDraft, Citation, Corpus, Hit, IrDoc, QaDoc, QuestionSegment, Span } from './types.ts';

/** 話題の切り替えを示す言い回し。この直前で質問を分ける */
const TOPIC_CUES = ['それから', 'それと', 'あと', 'また、', '次に', 'もう一点', 'もう1点', 'もう一つ', 'もうひとつ', '二点目', '2点目', '二つ目', '加えて', 'さらに', '最後に', '別件で'];
const SENTENCE_END = /[。？?！!]/;
const COMMA = /[、，,]/;
/** 質問の言い回し。ここまでを 1 つの質問として区切る */
const QUESTION_MARK = /(のか|ですか|ますか|でしょうか|かどうか|ないか|教えて|聞きたい|伺いたい|知りたい|確認したい|説明して|いかが|どう|なぜ|何が|何を|何で|疑問|心配|ください|お願いします|[？?])/;
/** 自己紹介など、質問の文脈に含めない節 */
const NOISE = /(株主番号|と申します|^すみません|^失礼します)/;
/** 議長の進行の言葉。質問の言い回し（「ください」など）を含んでも質問にしない */
const CHAIR = /(ご質問をお受け|ご発言の際|お名前をおっしゃ|株主番号とお名前|挙手|の方[、,\s]*どうぞ|^次の方|ほかにご質問|他にご質問|質疑応答を終了|ご質問ありがとうございま|以上をもちまして)/;
/** これ未満の一致は「想定問答なし（新規質問）」として扱う */
const NOVEL_SCORE = 12;
/** 質問の言い回しがまだ無くても仮のカードを出す一致の強さ */
const STRONG_SCORE = 20;
/** 一致度を 0〜1 で表示するときの満点の目安 */
const FULL_SCORE = 40;
/** 短い締め（「そこを確認したいです」など）とみなして直前の質問へ寄せる長さ */
const PREFACE_MAX = 20;

export type Boundary = 'start' | 'sentence' | 'cue' | 'comma';

export interface Clause {
  span: Span;
  text: string;
  /** この節の直前の区切り */
  boundary: Boundary;
}

/** 文末記号・話題の切り替え・読点で文字起こしを細かく区切る。位置（offset）は元の文字列のまま保つ */
export function splitClauses(transcript: string): Clause[] {
  const clauses: Clause[] = [];
  let start = 0;
  let boundary: Boundary = 'start';
  const push = (end: number, next: Boundary) => {
    const raw = transcript.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) {
      clauses.push({ span: { start: start + lead, end: start + lead + text.length }, text, boundary });
      boundary = next;
    } else if (next === 'sentence' || next === 'cue') {
      boundary = next;
    }
    start = end;
  };
  for (let i = 0; i < transcript.length; i++) {
    const ch = transcript[i];
    if (SENTENCE_END.test(ch)) {
      push(i + 1, 'sentence');
      continue;
    }
    if (COMMA.test(ch)) {
      const rest = transcript.slice(i + 1).trimStart();
      push(i + 1, TOPIC_CUES.some((c) => rest.startsWith(c)) ? 'cue' : 'comma');
      continue;
    }
    if (i > start && /\s/.test(transcript[i - 1])) {
      const rest = transcript.slice(i);
      if (TOPIC_CUES.some((c) => rest.startsWith(c))) {
        push(i, 'cue');
      }
    }
  }
  push(transcript.length, 'sentence');
  return clauses;
}

function snippetAround(text: string, index: number, length: number, radius = 36): { snippet: string; highlight: Span } {
  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + length + radius);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  return {
    snippet: `${prefix}${text.slice(from, to)}${suffix}`,
    highlight: { start: prefix.length + index - from, end: prefix.length + index - from + length },
  };
}

/** 正規化した数値（例: 1234億円）を、桁区切りや全角を含む元の文から探す */
export function findNumber(text: string, number: string): { index: number; length: number } | null {
  const m = number.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!m) {
    return null;
  }
  const [, digits, unit] = m;
  const digitPattern = digits.split('').map((d) => (d === '.' ? '\\.' : `${d},?`)).join('').replace(/,\?$/, '');
  const unitPattern = unit.replace('%', '[%％]').replace('pt', '(?:pt|ポイント)');
  const re = new RegExp(`(?<![\\d.,])${digitPattern}\\s*${unitPattern}`);
  const source = text.normalize('NFKC');
  const hit = re.exec(source);
  return hit ? { index: hit.index, length: hit[0].length } : null;
}

export interface Engine {
  qaCount: number;
  irCount: number;
  searchQa(query: string, limit?: number): Hit<QaDoc>[];
  searchIr(query: string, limit?: number): Hit<IrDoc>[];
  analyze(transcript: string): QuestionSegment[];
  compose(qa: QaDoc): AnswerDraft;
}

export function createEngine(corpus: Corpus): Engine {
  const qaIndex = new Bm25Index<QaDoc>(corpus.qa, (qa) => [
    { text: qa.question, weight: 3 },
    { text: qa.questionVariants.join('\n'), weight: 1 },
    { text: qa.keywords.join(' '), weight: 4 },
    { text: qa.category, weight: 2 },
    { text: qa.answerPoints.join(' '), weight: 1 },
  ]);
  const irIndex = new Bm25Index<IrDoc>(corpus.ir, (ir) => [
    { text: ir.text, weight: 1 },
    { text: ir.section, weight: 2 },
    { text: ir.docTitle, weight: 1 },
  ]);
  const irById = new Map(corpus.ir.map((ir) => [ir.id, ir]));

  const analyze = (transcript: string): QuestionSegment[] => {
    type Unit = { span: Span; boundary: Boundary; question: boolean };
    const units: Unit[] = [];
    let current: Unit | null = null;
    let context: Span | null = null;
    const close = () => {
      if (current) {
        if (current.question) {
          units.push(current);
        } else {
          context = current.span;
        }
      }
      current = null;
    };
    for (const clause of splitClauses(transcript)) {
      if (clause.boundary !== 'comma') {
        close();
      }
      const content = stripFillers(clause.text).replace(/[、。，,.？?！!\s]/g, '');
      if (!content) {
        continue;
      }
      if (CHAIR.test(clause.text) || (NOISE.test(clause.text) && !QUESTION_MARK.test(clause.text))) {
        current = null;
        context = null;
        continue;
      }
      if (current) {
        current.span.end = clause.span.end;
      } else {
        current = { span: { start: (context as Span | null)?.start ?? clause.span.start, end: clause.span.end }, boundary: clause.boundary, question: false };
        context = null;
      }
      if (QUESTION_MARK.test(clause.text)) {
        current.question = true;
        units.push(current);
        current = null;
      }
    }
    // 話し途中（質問の言い回しがまだ来ていない）でも、強く一致していれば仮のカードを出す
    const tail: Span | null = (current as Unit | null)?.span ?? context;
    if (tail) {
      const hits = qaIndex.search(transcript.slice(tail.start, tail.end), 1);
      if (hits[0] && hits[0].score >= STRONG_SCORE) {
        units.push({ span: tail, boundary: 'sentence', question: false });
      }
    }

    type Judged = Unit & { hits: Hit<QaDoc>[]; novel: boolean };
    const judged: Judged[] = [];
    for (const unit of units) {
      const text = transcript.slice(unit.span.start, unit.span.end);
      const hits = qaIndex.search(text, 3);
      const novel = !hits[0] || hits[0].score < NOVEL_SCORE;
      const last = judged[judged.length - 1];
      const adjacent = !!last && transcript.slice(last.span.end, unit.span.start).replace(/[、。，,\s]/g, '') === '';
      // 「そこを確認したいです」のような短い締めは直前の質問に含める
      const closing = novel && text.length <= PREFACE_MAX;
      if (last && adjacent && unit.boundary !== 'cue' && (closing || (novel && last.novel) || (!novel && !last.novel && hits[0].doc.id === last.hits[0].doc.id))) {
        last.span = { start: last.span.start, end: unit.span.end };
        const merged = qaIndex.search(transcript.slice(last.span.start, last.span.end), 3);
        last.hits = merged;
        last.novel = !merged[0] || merged[0].score < NOVEL_SCORE;
        continue;
      }
      if (novel && last && adjacent) {
        // 「利益率を下げずにできるのか」のように短い追加質問は、直前の質問を文脈にして引き直す（直前と同じ候補は除く）
        const own = normalize(text);
        const withContext = qaIndex
          .search(`${transcript.slice(last.span.start, last.span.end)} ${text}`, 6)
          .filter((h) => h.doc.id !== last.hits[0]?.doc.id && h.matched.some((m) => own.includes(m)));
        if (withContext[0] && withContext[0].score >= NOVEL_SCORE) {
          judged.push({ ...unit, span: { ...unit.span }, hits: withContext.slice(0, 3), novel: false });
          continue;
        }
      }
      judged.push({ ...unit, span: { ...unit.span }, hits, novel });
    }
    return judged.map(({ span, hits, novel }) => ({
      span,
      text: transcript.slice(span.start, span.end),
      category: novel ? '新規質問' : hits[0].doc.category,
      candidates: hits,
      confidence: hits[0] ? Math.min(1, hits[0].score / FULL_SCORE) : 0,
      novel,
    }));
  };

  const compose = (qa: QaDoc): AnswerDraft => {
    const citations: Citation[] = [
      { claim: '回答の骨子', kind: 'qa', sourceId: qa.id, sourceTitle: `想定問答 ${qa.id}（${qa.category}）`, snippet: qa.question },
    ];
    const unverified: string[] = [];
    const preferred = qa.sourceIds.map((id) => irById.get(id)).filter((ir): ir is IrDoc => !!ir);
    const others = corpus.ir.filter((ir) => !qa.sourceIds.includes(ir.id));
    for (const number of extractClaims(qa.answer)) {
      let cited = false;
      for (const ir of [...preferred, ...others]) {
        const hit = findNumber(ir.text, number);
        if (hit) {
          const { snippet, highlight } = snippetAround(ir.text.normalize('NFKC'), hit.index, hit.length);
          citations.push({ claim: number, kind: 'number', sourceId: ir.id, sourceTitle: `${ir.docTitle}｜${ir.section}`, page: ir.page, snippet, highlight });
          cited = true;
          break;
        }
      }
      if (!cited) {
        const figure = corpus.keyFigures.find((f) => normalize(f.display).replace(/\s+/g, '') === number);
        if (figure) {
          citations.push({ claim: number, kind: 'number', sourceId: figure.key, sourceTitle: `主要数値｜${figure.label}`, snippet: `${figure.label}: ${figure.display}` });
        } else {
          unverified.push(number);
        }
      }
    }
    return {
      qaId: qa.id,
      responder: qa.responder,
      text: qa.answer,
      points: qa.answerPoints,
      cautions: qa.cautions,
      citations,
      unverified,
    };
  };

  return {
    qaCount: qaIndex.size,
    irCount: irIndex.size,
    searchQa: (query, limit = 5) => qaIndex.search(query, limit),
    searchIr: (query, limit = 5) => irIndex.search(query, limit),
    analyze,
    compose,
  };
}

export interface Card {
  id: string;
  segment: QuestionSegment;
  /** 担当者が採用した想定問答。未選択なら候補の 1 位を使う */
  adoptedQaId?: string;
}

/**
 * 文字起こしの更新ごとに作り直した質問を、前回のカードと位置の重なりで対応付けて id を保つ。
 * id が変わらなければアニメーションは位置の移動として描かれ、採用済みの選択も引き継がれる。
 */
export function reconcileCards(previous: Card[], segments: QuestionSegment[], newId: () => string): Card[] {
  const used = new Set<string>();
  return segments.map((segment) => {
    const match = previous.find(
      (card) => !used.has(card.id) && card.segment.span.start < segment.span.end && segment.span.start < card.segment.span.end,
    );
    if (match) {
      used.add(match.id);
      return { id: match.id, segment, adoptedQaId: match.adoptedQaId };
    }
    return { id: newId(), segment };
  });
}
