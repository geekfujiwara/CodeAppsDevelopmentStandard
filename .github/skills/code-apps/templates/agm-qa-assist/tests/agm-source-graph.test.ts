import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerLines, layoutColumns, sourceLinks } from '../src/lib/agm/source-graph.ts';

const text = `【要約】
- 年間配当は60円です [QA-001] [IR-003]
- 増配は利益成長が前提です [QA-002]
【回答案】
2026年3月期の配当は60円を予定しています [IR-003]。自己株式取得は配当の代わりではありません [QA-004]。
【補足・注意】
- 将来の株価には触れない [QA-099]`;

test('回答案を行に分け、行ごとの引用 ID を取る', () => {
  const lines = answerLines(text);
  assert.deepEqual(lines.map((l) => l.key), ['s0', 's1', 'a', 'n0']);
  assert.deepEqual(lines[0].cites, ['QA-001', 'IR-003']);
  assert.deepEqual(lines[2].cites, ['IR-003', 'QA-004']);
});

test('生成途中（見出しの途中）でも崩れない', () => {
  const lines = answerLines('【要約】\n- 年間配当は60円 [QA-0');
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].cites, []);
});

test('渡した根拠と回答の行を結び、未引用・渡していない引用を分ける', () => {
  const r = sourceLinks(['QA-001', 'QA-002', 'QA-004', 'IR-003', 'IR-010'], answerLines(text));
  assert.deepEqual(r.uses.get('IR-003')?.lines, ['s0', 'a']);
  assert.equal(r.uses.get('IR-003')?.count, 2);
  assert.deepEqual(r.uncited, ['IR-010']);
  assert.deepEqual(r.unknown, ['QA-099']);
  assert.equal(r.links.length, 5);
  assert.ok(r.links.some((l) => l.from === 'QA-004' && l.to === 'a'));
});

test('列の配置: IR は参照している想定問答の順に並び、列の中央がそろう', () => {
  const p = layoutColumns({ qa: [{ id: 'QA-1', sourceIds: ['IR-9'] }, { id: 'QA-2', sourceIds: ['IR-1'] }], ir: [{ id: 'IR-1' }, { id: 'IR-5' }, { id: 'IR-9' }] });
  assert.deepEqual(p.ir.map((x) => x.id), ['IR-9', 'IR-1', 'IR-5']);
  const mid = (xs: { y: number }[]) => (xs[0].y + xs[xs.length - 1].y) / 2;
  assert.equal(mid(p.qa), mid(p.ir));
  assert.equal(p.query.y, mid(p.qa));
  assert.ok(p.qa[0].x < p.answer.x && p.answer.x < p.ir[0].x);
});
