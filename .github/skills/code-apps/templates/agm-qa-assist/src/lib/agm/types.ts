export interface QaDoc {
  id: string;
  category: string;
  question: string;
  questionVariants: string[];
  keywords: string[];
  answer: string;
  answerPoints: string[];
  responder: string;
  sourceIds: string[];
  cautions: string[];
  /** 下書き（Copilot Studio・Cowork・アプリで作成、承認待ち）/ 承認済み。空は承認済み（既存データ） */
  status?: string;
  /** 作成元（Copilot Studio / Cowork / アプリ / デモデータ など） */
  createdVia?: string;
}

export interface IrDoc {
  id: string;
  docTitle: string;
  docType: string;
  section: string;
  page: number;
  text: string;
}

export interface KeyFigure {
  key: string;
  label: string;
  display: string;
}

export interface Corpus {
  qa: QaDoc[];
  ir: IrDoc[];
  keyFigures: KeyFigure[];
}

export interface Hit<T> {
  doc: T;
  score: number;
  matched: string[];
}

export interface Span {
  start: number;
  end: number;
}

export interface QuestionSegment {
  /** 文字起こし全体での位置。ハイライトに使う */
  span: Span;
  text: string;
  category: string;
  candidates: Hit<QaDoc>[];
  /** 1 位の一致の強さ（0〜1） */
  confidence: number;
  /** 想定問答に十分な一致が無い（新規質問） */
  novel: boolean;
}

export interface Citation {
  /** 回答案の中の数字・言い回し */
  claim: string;
  kind: 'number' | 'qa';
  sourceId: string;
  sourceTitle: string;
  page?: number;
  snippet: string;
  /** snippet の中で claim に当たる位置 */
  highlight?: Span;
}

export interface AnswerDraft {
  qaId: string;
  responder: string;
  text: string;
  points: string[];
  cautions: string[];
  citations: Citation[];
  unverified: string[];
}

export interface TranscriptView {
  text: string;
  /** 途中結果（未確定）が始まる位置。text.length と同じなら途中結果なし */
  interimStart: number;
}
