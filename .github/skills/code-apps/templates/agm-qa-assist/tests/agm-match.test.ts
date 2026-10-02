import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { introName, nameSimilarity, numberSimilarity, rivalsOf, shortlist } from '../src/lib/agm/match.ts';
import { spokenDigits } from '../src/lib/agm/turns.ts';
import type { Shareholder } from '../src/lib/agm/shareholders.ts';

const load = (n: string) => JSON.parse(readFileSync(new URL(`../data/demo/${n}.json`, import.meta.url), 'utf8'));
const register: Shareholder[] = load('shareholders');
const cases: { id: string; utterance: string; expected: string | null }[] = load('identify-cases');

test('発言の数字をつなげて取り出す（区切り・句点・読み・位取り）', () => {
  assert.equal(spokenDigits('を200。3 16番の藤原です。'), '200316');
  assert.equal(spokenDigits('レイ1二3の'), '0123');
  assert.equal(spokenDigits('、千八百八十一番の'), '1881');
  assert.equal(spokenDigits('、にーさんろくの'), '236');
});

test('番号の近さは数字の並びで評価する（「200316」と 236）', () => {
  assert.ok(numberSimilarity('0236', '200316') >= 0.85);
  assert.ok(numberSimilarity('1024', '1024') === 1);
  assert.ok(numberSimilarity('0123', '0123') === 1);
  assert.ok(numberSimilarity('1601', '200316') < 0.6);
});

test('名乗った名前を取り、漢字・ひらがなの名字で名簿と比べる', () => {
  assert.equal(introName('株主番号を200。3 16番の藤原です。'), '藤原');
  assert.equal(introName('番号を忘れてしまいまして、藤井と申します。'), '藤井');
  const koga = register.find((s) => s.number === '1042')!;
  assert.ok(nameSimilarity('こが', koga) >= 0.9);
});

test('照合の評価セットで、正解の株主が候補の上位 5 人に入る', () => {
  for (const c of cases.filter((x) => x.expected)) {
    const top = shortlist(register, c.utterance, 5).map((x) => x.shareholder.number);
    assert.ok(top.includes(c.expected!), `${c.id}: ${c.utterance} → ${top.join(',')}`);
  }
});
test('同じ名字で番号も近い候補がいれば「紛らわしい」として自動で決めない（「200。3 16」の藤原は 0236 と 2036）', () => {
  for (const c of cases.filter((x) => x.expected)) {
    const rivals = rivalsOf(c.expected, shortlist(register, c.utterance)).map((x) => x.shareholder.number);
    if (c.id === 'ID-01') assert.deepEqual(rivals, ['2036'], c.id);
    else assert.deepEqual(rivals, [], `${c.id}: ${c.utterance} → ${rivals.join(',')}`);
  }
});