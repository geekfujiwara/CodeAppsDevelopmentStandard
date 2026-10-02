const FILLERS = [
  'えーと', 'ええと', 'えー', 'えっと', 'あのー', 'あの', 'うーん', 'まあ', 'その', 'ちょっと',
];

const STOP_WORDS = new Set([
  'です', 'ます', 'ました', 'でしょう', 'ですか', 'ますか', 'について', 'という', 'ください', 'でした', 'いる', 'ある',
  'する', 'して', 'され', 'された', 'こと', 'もの', 'ところ', 'よう', 'ため', 'それ', 'これ', 'そこ', 'どう', 'なる',
  'なり', 'から', 'まで', 'ので', 'けど', 'けれど', 'たい', 'たら', 'なの', 'なのか', 'のか', 'でしょうか', 'お願い',
  '質問', '確認', '教え', '思い', '思う', '株主', '株主番号', '番号', 'いただき', 'いただけ', 'いう', 'ござい',
]);

const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter('ja', { granularity: 'word' })
  : null;

const CONTENT_CHAR = /[\p{Script=Han}\p{Script=Katakana}ー\p{L}\p{N}%％.]/u;
const BIGRAM_CHAR = /[\p{Script=Han}\p{Script=Katakana}ー\p{Script=Latin}\p{N}]/u;

/** 全角英数・記号を半角に寄せ、桁区切りのカンマを取り除く */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/\s+/g, ' ');
}

export function stripFillers(text: string): string {
  let out = text;
  for (const filler of FILLERS) {
    out = out.split(filler).join(' ');
  }
  return out;
}

/** 数値 + 単位（億円・%・円・名・年 など）を正規化して取り出す */
export function extractNumbers(text: string): string[] {
  const found = normalize(text).match(/\d+(?:\.\d+)?\s*(?:億円|百万円|万円|円|%|ポイント|pt|倍|名|人|件|社|年|か月|ヶ月|カ月|期|拠点|カ国|か国|株)/g) ?? [];
  return [...new Set(found.map((n) => n.replace(/\s+/g, '')))];
}

/** 回答案で根拠を確かめる数値。西暦（2026年 など）は日付の一部なので除く */
export function extractClaims(text: string): string[] {
  return extractNumbers(text).filter((n) => !/^\d{4}年$/.test(n));
}

function wordTokens(text: string): string[] {
  if (!SEGMENTER) {
    return [];
  }
  const tokens: string[] = [];
  for (const part of SEGMENTER.segment(text)) {
    const word = part.segment.trim();
    if (!part.isWordLike || word.length < 2 || STOP_WORDS.has(word) || !CONTENT_CHAR.test(word)) {
      continue;
    }
    if (/^[\p{Script=Hiragana}]+$/u.test(word)) {
      continue;
    }
    tokens.push(word);
  }
  return tokens;
}

function bigrams(text: string): string[] {
  const grams: string[] = [];
  let run = '';
  const flush = () => {
    for (let i = 0; i + 1 < run.length; i++) {
      grams.push(`${run[i]}${run[i + 1]}`);
    }
    run = '';
  };
  for (const ch of text) {
    if (BIGRAM_CHAR.test(ch)) {
      run += ch;
    } else {
      flush();
    }
  }
  flush();
  return grams;
}

/**
 * 検索用のトークン列。語（Intl.Segmenter）と、漢字・カタカナ・英数の連続から作る 2 文字 gram、数値＋単位を混ぜる。
 * 語だけだと音声認識の表記ゆれ（自社株買い / 自己株式取得）に弱く、2 文字 gram だけだと語の境界を失うため。
 */
export function tokenize(text: string): string[] {
  const normalized = normalize(stripFillers(text));
  return [
    ...wordTokens(normalized),
    ...bigrams(normalized).map((g) => `#${g}`),
    ...extractNumbers(normalized).map((n) => `=${n}`),
  ];
}
