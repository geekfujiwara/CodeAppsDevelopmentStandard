import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citedIds, splitSections, unverifiedClaims } from '../src/lib/agm/generated.ts';

const full = `【要約】
- 増配は利益成長を前提に検討 [QA-002]
- 自己株式取得は配当の代わりではない [QA-004]

【回答案】
ご質問ありがとうございます。年間配当60円を予定しております。自己株式取得の20億円は配当の代わりではございません。[QA-002][IR-011]

【補足・注意】
- 特になし`;

test('生成文を見出しで要約・回答案・補足に分ける', () => {
  const s = splitSections(full);
  assert.equal(s.summary.length, 2);
  assert.ok(s.answer.startsWith('ご質問ありがとうございます'));
  assert.deepEqual(s.notes, ['特になし']);
});

test('生成の途中（見出しの途中まで）でも崩れない', () => {
  assert.deepEqual(splitSections('【要約】\n- 増配は'), { summary: ['増配は'], answer: '', notes: [] });
  assert.deepEqual(splitSections('【要').summary, ['【要']);
  assert.equal(splitSections('【要約】\n- a\n【回答案】\nご質問').answer, 'ご質問');
});

test('引用した ID と、根拠に無い数値を取り出す', () => {
  assert.deepEqual(citedIds(full), ['QA-002', 'QA-004', 'IR-011']);
  assert.deepEqual(unverifiedClaims(full, ['年間配当は60円', '上限額は20億円']), []);
  assert.deepEqual(unverifiedClaims('配当は年間70円です', ['年間配当は60円']), ['70円']);
});
