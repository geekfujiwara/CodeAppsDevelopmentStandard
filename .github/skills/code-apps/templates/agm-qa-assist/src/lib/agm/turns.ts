/**
 * 連続した文字起こしを、株主が名乗った株主番号で発言（ターン）に区切る。
 * 録音を止めずに続けるため、区切りは「株主番号〇〇」を含む発話（フレーズ）の始まりに置く。
 */

export interface Phrase {
  /** 安定したキー（確定文の id など） */
  key: string;
  text: string;
  /** 音声ストリームの先頭からの位置（ms）。録音の切り出しに使う */
  offsetMs: number;
  final: boolean;
}

export interface Turn {
  /** 最初のフレーズのキーから作る。文字起こしが伸びても変わらない */
  key: string;
  /** 数字に直せた株主番号。聞き取れなかったときは null */
  number: string | null;
  /** 「株主番号」の後ろで聞こえたまま（数字に直せなかったときの手がかり。例: 「えーと」） */
  heard: string | null;
  /** 発言で名乗った名前（「〇〇番の青山です」の青山） */
  spokenName: string | null;
  startOffsetMs: number;
  phrases: Phrase[];
  /** 区切りのきっかけ: 株主番号 / 議長の「〜の方どうぞ」 / 手動 / 先頭 */
  cause: 'number' | 'cue' | 'manual' | 'start';
}

const KANJI_DIGIT: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

/**
 * 数字の読み（音声認識がカタカナ・ひらがなで返すことがある）。長いものから順に置き換える。
 * 例: 「レイ1二3」「ゼロイチニーサン」「いち、ぜろ、に、よん」
 */
const READINGS: [string, string][] = [
  ['キュウ', '9'], ['きゅう', '9'], ['シチ', '7'], ['しち', '7'], ['ナナ', '7'], ['なな', '7'], ['ハチ', '8'], ['はち', '8'],
  ['ロク', '6'], ['ろく', '6'], ['ヨン', '4'], ['よん', '4'], ['サン', '3'], ['さん', '3'], ['ニー', '2'], ['にー', '2'],
  ['イチ', '1'], ['いち', '1'], ['ゼロ', '0'], ['ぜろ', '0'], ['レイ', '0'], ['れい', '0'], ['マル', '0'], ['まる', '0'],
  ['ゴー', '5'], ['ごー', '5'], ['ニ', '2'], ['に', '2'], ['ゴ', '5'], ['ご', '5'], ['ク', '9'], ['シ', '4'], ['○', '0'], ['◯', '0'],
];
const NUMERIC_CHAR = /[0-9〇零一二三四五六七八九十百千万]/;

/**
 * 「0123」「０１２３」「一〇二四」「千二十四」「レイ1二3」「ゼロイチニーサン」「1・0・2・4」を数字の文字列にする。
 * 位取り（十・百・千）があれば位取りで、無ければ 1 文字ずつ数字に直す（先頭の 0 を残す）。
 */
export function toDigits(raw: string): string | null {
  let s = raw.normalize('NFKC').replace(/[\s、,・.\-‐－]+/g, '');
  for (const [reading, digit] of READINGS) s = s.split(reading).join(digit);
  s = s.replace(/ー/g, '');
  if (!s || [...s].some((c) => !NUMERIC_CHAR.test(c))) return null;
  if (!/[十百千万]/.test(s)) return [...s].map((c) => (/\d/.test(c) ? c : String(KANJI_DIGIT[c]))).join('');
  let total = 0;
  let section = 0;
  let digits = '';
  for (const c of s) {
    if (/\d/.test(c) || c in KANJI_DIGIT) {
      digits += /\d/.test(c) ? c : String(KANJI_DIGIT[c]);
      continue;
    }
    const value = digits ? Number(digits) : 1;
    digits = '';
    if (c === '万') {
      total += (section + value) * 10000;
      section = 0;
    } else {
      section += value * KANJI_UNIT[c];
    }
  }
  return String(total + section + (digits ? Number(digits) : 0));
}

/**
 * 発言の中の数字をすべて数字の文字列にする（読み・漢数字・位取りを含む）。区切りや句点で分かれた数字はつなげる。
 * 例: 「株主番号を200。3 16番」→ 200316、「千八百八十一番」→ 1881。照合の候補選びに使う
 */
export function spokenDigits(text: string): string {
  let s = text.normalize('NFKC');
  for (const [reading, digit] of READINGS) if (reading.length >= 2) s = s.split(reading).join(digit);
  const runs = s.match(/[0-9〇零一二三四五六七八九十百千万]+/g) ?? [];
  return runs.map((r) => toDigits(r) ?? '').join('');
}

// 「株主番号」の後ろ、「番」「の」「です」などの手前までを番号として取り出す
const NUMBER_PATTERN = /株主番号\s*(?:は|が)?[、,\s]*(?:(?:えーと|えっと|ええと|えー|あのー?|その)[、,\s]*)*(.{1,24}?)\s*(番|の|です|でございます|と申します|、|,|。|$)/;
/** 数字・漢数字・数字の読みを 1 つでも含むか（含まなければ株主番号の名乗りとはみなさない。例: 「株主番号とお名前を」） */
const LOOKS_NUMERIC = new RegExp(`[0-9０-９〇零一二三四五六七八九十百千○◯]|${READINGS.filter(([r]) => r.length >= 2).map(([r]) => r).join('|')}`);

export interface NumberHit {
  /** 数字に直せた番号（直せなければ null。名乗りがあったことは分かる） */
  number: string | null;
  heard: string;
  index: number;
  spokenName: string | null;
}

/**
 * 発話から株主番号を取り出す。途中結果（final=false）では番号の後ろに「番」「の」「です」などが来るまで待つ
 * （「株主番号12」のように読み上げ途中の数字で区切らないため）。
 * 数字に直せない読み（「レイイチ…」の誤認識など）でも、名乗りとして扱い number=null で返す。
 */
export function findShareholderNumber(text: string, final: boolean): NumberHit | null {
  const m = NUMBER_PATTERN.exec(text);
  if (!m) return null;
  if (!final && m[2] === '') return null;
  const heard = m[1].trim();
  if (!LOOKS_NUMERIC.test(heard.normalize('NFKC'))) return null;
  const digits = toDigits(heard);
  const number = digits && digits.length >= 2 && digits.length <= 10 ? digits : null;
  const rest = text.slice(m.index + m[0].length - m[2].length);
  const name = /^(?:番)?\s*の?\s*([^\s、。,]{1,8}?)(?:です|と申します|でございます)/.exec(rest);
  return { number, heard, index: m.index, spokenName: name ? name[1] : null };
}

/**
 * 議長が次の発言者を指名した（「〜の方どうぞ」「次の方どうぞ」）。次のフレーズから新しい株主として区切る。
 * 「方どうぞ」は「報道」と誤認識されることがある（実測）ため、文末の「の報道」も指名として扱う。
 */
const NEXT_SPEAKER_CUE = /((方|かた)?[、,\s]*どうぞ|の報道)[。．！!？?]?\s*$/;
/** 番号を言わずに名乗った（「古賀と申します」）。回答が済んだ後なら次の株主とみなす */
const SELF_INTRO = /([^\s、。,]{1,6})(?:と申します|でございます)/;

/**
 * フレーズの列をターンに分ける。次のどれかで新しいターンにする。
 * - 株主番号を名乗ったフレーズ（番号が数字に直せなくても区切る）。直前のターンと同じ番号の言い直しでは区切らない
 * - 議長が「〜の方どうぞ」と指名した次のフレーズ（株主が番号を言わなくても先へ進めるため）
 * - 手動で区切ったフレーズ
 */
export function splitTurns(phrases: Phrase[], manualCuts: ReadonlySet<string> = new Set()): Turn[] {
  const turns: Turn[] = [];
  let cueBefore = false;
  for (const phrase of phrases) {
    const hit = findShareholderNumber(phrase.text, phrase.final);
    const current = turns[turns.length - 1];
    const manual = manualCuts.has(phrase.key);
    // 番号の言い直し（同じ番号、または直前の名乗りのすぐ後に番号が読めない名乗り）では区切らない
    // 名乗り・指名の直後（2 フレーズ以内）に番号が言い直された場合も、同じ株主として番号だけ埋める
    const fresh = !!current && (current.cause === 'number' || current.cause === 'cue') && current.phrases.length <= 2;
    // 議長が次の人を指名した直後の名乗りは、言い直しではなく新しい株主
    const repeated = !cueBefore && !!current && !!hit && ((!!hit.number && hit.number === current.number) || (fresh && (!hit.number || !current.number)));
    // 回答が済んだターンで、番号を言わずに名乗ったら次の株主（「番号を忘れてしまいまして、古賀と申します」）
    const intro = !hit && phrase.final ? SELF_INTRO.exec(phrase.text) : null
    const answered = !!current && ANSWER_CUE.test(turnText(current));
    const fromCue = (cueBefore && !!current) || (!!intro && answered);
    if (!current || manual || (hit && !repeated) || (fromCue && !hit)) {
      turns.push({
        key: `t-${phrase.key}`,
        number: hit?.number ?? null,
        heard: hit?.heard ?? null,
        spokenName: hit?.spokenName ?? (intro ? intro[1] : null),
        startOffsetMs: phrase.offsetMs,
        phrases: [phrase],
        cause: hit ? 'number' : manual ? 'manual' : fromCue ? 'cue' : 'start',
      });
    } else {
      current.phrases.push(phrase);
      if (hit && !current.number && hit.number) {
        current.number = hit.number;
        current.heard = hit.heard;
        current.spokenName = hit.spokenName ?? current.spokenName;
      } else if (hit && !current.heard) {
        current.heard = hit.heard;
        current.spokenName = hit.spokenName ?? current.spokenName;
      }
    }
    // 途中結果の「どうぞ」では区切らない（確定してから）
    cueBefore = phrase.final && NEXT_SPEAKER_CUE.test(phrase.text);
  }
  return turns;
}
const ANSWER_CUE = /(お答え|ご回答|回答|ご説明)(?:を)?(?:いたし|申し上げ|し|させていただき)ます/;

/**
 * 回答（議長・役員の発言）が始まる位置。そこから先は質問の検出に使わない。
 * 「…よりお答えいたします」を含む文の先頭を返す。無ければ text.length。
 */
export function answerStart(text: string): number {
  const m = ANSWER_CUE.exec(text);
  if (!m) return text.length;
  let start = m.index;
  while (start > 0 && !/[。？?！!\n]/.test(text[start - 1])) start--;
  return start;
}

export function turnText(turn: Turn): string {
  return turn.phrases.map((p) => p.text).join('\n');
}
