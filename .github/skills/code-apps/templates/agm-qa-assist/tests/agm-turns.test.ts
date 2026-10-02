import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerStart, findShareholderNumber, splitTurns, toDigits, turnText, type Phrase } from '../src/lib/agm/turns.ts';
import { createEngine } from '../src/lib/agm/engine.ts';

test('漢数字・全角の株主番号を数字にする', () => {
  assert.equal(toDigits('０１２３'), '0123');
  assert.equal(toDigits('一〇二四'), '1024');
  assert.equal(toDigits('千二十四'), '1024');
  assert.equal(toDigits('二千五十'), '2050');
  assert.equal(toDigits('abc'), null);
});

test('名乗りから株主番号と名前を取り出す', () => {
  assert.deepEqual(findShareholderNumber('株主番号0123の青山です。配当について', true), { number: '0123', heard: '0123', index: 0, spokenName: '青山' });
  assert.deepEqual(findShareholderNumber('はい、株主番号1024番の古賀です', true)?.number, '1024');
  assert.equal(findShareholderNumber('株主番号1024番の古賀です', true)?.spokenName, '古賀');
  assert.equal(findShareholderNumber('最初に株主番号とお名前をおっしゃってください', true), null);
});

test('途中結果では番号の読み上げが終わるまで区切らない', () => {
  assert.equal(findShareholderNumber('株主番号10', false), null);
  assert.equal(findShareholderNumber('株主番号1024番', false)?.number, '1024');
  assert.equal(findShareholderNumber('株主番号1024', true)?.number, '1024');
});

const phrase = (key: string, text: string, offsetMs: number, final = true): Phrase => ({ key, text, offsetMs, final });
const phraseIds = (t: { phrases: Phrase[] }) => t.phrases.map((p) => p.key);

test('連続した発言を株主番号で区切り、同じ番号の言い直しでは区切らない', () => {
  const turns = splitTurns([
    phrase('1', 'それでは、ご質問をお受けいたします。', 0),
    phrase('2', '株主番号0123の青山です。配当は続くのか。', 5000),
    phrase('3', '株主番号0123です、もう一度言います。', 9000),
    phrase('4', '取締役CFOよりお答えいたします。', 12000),
    phrase('5', '株主番号1024番の古賀です。', 20000),
    phrase('6', '役員報酬は妥当なのか', 23000, false),
  ]);
  assert.deepEqual(turns.map((t) => [t.number, t.startOffsetMs, t.phrases.length]), [[null, 0, 1], ['0123', 5000, 3], ['1024', 20000, 2]]);
  assert.equal(turns[1].spokenName, '青山');
  assert.equal(turns[2].key, 't-5');
});

test('手動で区切ったフレーズから新しいターンにする', () => {
  const turns = splitTurns([phrase('1', '株主番号0123の青山です。', 0), phrase('2', '名乗らずに質問します', 4000)], new Set(['2']));
  assert.deepEqual(turns.map((t) => [t.number, t.cause]), [['0123', 'number'], [null, 'manual']]);
});

test('回答が始まった位置から先は質問の検出に使わない', () => {
  const text = '配当は続くのか。\nご質問ありがとうございます。取締役CFOよりお答えいたします。\n増配は検討します。';
  assert.equal(text.slice(answerStart(text)).startsWith('取締役CFOより'), true);
  assert.equal(answerStart('配当は続くのか。'), '配当は続くのか。'.length);
});

test('台本を通しで流すと、株主ごとに区切られ、回答は質問にならない', () => {
  const load = (n: string) => JSON.parse(readFileSync(new URL(`../data/demo/${n}.json`, import.meta.url), 'utf8'));
  const script = load('rehearsal-script') as { lines: { id: string; role: string; number?: string; text: string; note?: string }[] };
  const engine = createEngine({ qa: load('qa-master'), ir: load('ir-documents'), keyFigures: [] });
  const turns = splitTurns(script.lines.map((l, i) => phrase(l.id, l.text, i * 8000)));
  const holders = script.lines.filter((l) => l.role === 'shareholder');
  // 誤認識・番号なしの名乗り（note あり）も株主として区切る。番号はその後の AI 照合で決める
  const speaking = turns.filter((t) => t.number || t.heard || t.cause === 'cue');
  assert.equal(speaking.filter((t) => phraseIds(t).some((id) => holders.some((h) => h.id === id))).length, holders.length);
  const clean = holders.filter((l) => !l.note).map((l) => l.number);
  assert.deepEqual(turns.filter((t) => t.number && clean.includes(t.number)).map((t) => t.number), clean);
  for (const turn of turns.filter((t) => phraseIds(t).some((id) => holders.some((h) => h.id === id)))) {
    const text = turnText(turn);
    const cards = engine.analyze(text.slice(0, answerStart(text)));
    assert.ok(cards.length >= 1, `${turn.number} に質問がある`);
    assert.ok(cards.every((c) => !/お答え|差し控え|ございません/.test(c.text)), `${turn.number} の回答が質問になっていない`);
  }
});

test('音声認識の読み・漢数字・数字が混ざった株主番号を数字に直す', () => {
  assert.equal(toDigits('レイ1二3'), '0123');
  assert.equal(toDigits('ゼロイチニーサン'), '0123');
  assert.equal(toDigits('いち、ぜろ、に、よん'), '1024');
  assert.equal(toDigits('1・0・2・4'), '1024');
  assert.equal(toDigits('一〇二四'), '1024');
  assert.equal(toDigits('千二十四'), '1024');
  assert.equal(toDigits('1千24'), '1024');
  assert.equal(toDigits('二千五十'), '2050');
  assert.equal(toDigits('マルイチニーサン'), '0123');
  assert.equal(toDigits('えーと'), null);
});

test('実際の認識結果「株主番号レイ1二3の青山です」から番号と名前を取る', () => {
  const hit = findShareholderNumber('株主番号レイ1二3の青山です。', true);
  assert.equal(hit?.number, '0123');
  assert.equal(hit?.spokenName, '青山');
});

test('番号が数字に直せなくても名乗りとして扱い、議長の案内は名乗りにしない', () => {
  const hit = findShareholderNumber('株主番号イチゼロ何番かの古賀です', true);
  assert.ok(hit);
  assert.equal(hit.number, null);
  assert.equal(findShareholderNumber('ご発言の際は、最初に株主番号とお名前をおっしゃってください。', true), null);
});

test('番号が取れなくても次の株主に進む（読めない名乗り・議長の指名）', () => {
  const turns = splitTurns([
    phrase('1', '株主番号0123の青山です。配当は続くのか。', 0),
    phrase('2', '取締役CFOよりお答えいたします。', 5000),
    phrase('3', 'それでは、前から二列目の方どうぞ。', 9000),
    phrase('4', '役員報酬は妥当なのか教えてください。', 12000),
    phrase('5', '次の方どうぞ。', 20000),
    phrase('6', '株主番号えーと、イチゼロ何番かの古賀です。', 23000),
    phrase('7', '株主番号1024番です。', 26000),
  ]);
  assert.deepEqual(turns.map((t) => [t.number, t.cause, t.phrases.length]), [['0123', 'number', 3], [null, 'cue', 2], ['1024', 'number', 2]]);
});
test('議長の「方どうぞ」が「報道」と誤認識されても、番号なしの名乗り（と申します）でも次の株主に進む（実音声の認識結果）', () => {
  const turns = splitTurns([
    phrase('1', '株主番号0123の青山です。', 0),
    phrase('2', '配当は続くのか。そこを確認したいです。', 3000),
    phrase('3', '取締役CFOよりお答えいたします。', 8000),
    phrase('4', 'それでは、前から二列目の報道。', 15000),
    phrase('5', 'ええと、番号の書いた紙を忘れてしまいまして。古賀と申します。', 18000),
    phrase('6', '役員報酬は業績に見合っているのか教えてください。', 22000),
    phrase('7', '取締役会議長よりお答えいたします。', 26000),
    phrase('8', '佐藤と申します。株価について伺います。', 30000),
  ]);
  assert.deepEqual(turns.map((t) => [t.number, t.cause, t.spokenName, t.phrases.length]), [['0123', 'number', '青山', 4], [null, 'cue', '古賀', 3], [null, 'cue', '佐藤', 1]]);
});