import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkQa, nextQaCode } from '../src/lib/agm/qa-check.ts';
import { parseLines } from '../src/lib/agm/script-lines.ts';
import type { IrDoc, QaDoc } from '../src/lib/agm/types.ts';

const load = (n: string) => JSON.parse(readFileSync(new URL(`../data/demo/${n}.json`, import.meta.url), 'utf8'));
const qa: QaDoc[] = load('qa-master');
const ir: IrDoc[] = load('ir-documents');

test('次の問答コードは最大の番号 + 1', () => {
  const max = Math.max(...qa.map((q) => Number(q.id.slice(3))));
  assert.equal(nextQaCode(qa), `QA-${String(max + 1).padStart(3, '0')}`);
  assert.equal(nextQaCode([]), 'QA-001');
});

test('保存前チェック: 必須・重複・根拠 ID・根拠に無い数値', () => {
  const base: QaDoc = { ...qa[0], id: nextQaCode(qa) };
  assert.deepEqual(checkQa(base, qa, ir).filter((i) => i.severity === 'error'), []);
  assert.ok(checkQa({ ...base, id: qa[1].id }, qa, ir).some((i) => i.field === 'id' && i.severity === 'error'));
  assert.equal(checkQa({ ...qa[1] }, qa, ir, qa[1].id).filter((i) => i.field === 'id').length, 0, '自分自身の編集は重複にしない');
  assert.ok(checkQa({ ...base, answer: '' }, qa, ir).some((i) => i.field === 'answer' && i.severity === 'error'));
  assert.ok(checkQa({ ...base, sourceIds: ['IR-999'] }, qa, ir).some((i) => i.field === 'sourceIds'));
  const invented = checkQa({ ...base, answer: `${base.answer} 来期は 999 億円を見込みます。` }, qa, ir);
  assert.ok(invented.some((i) => i.field === 'answer' && i.message.includes('999億円')), JSON.stringify(invented));
});

test('台本の行（JSON）を検証し、役・本文の欠けた行を落とす', () => {
  const { lines, dropped } = parseLines(JSON.stringify([
    { id: 'L01', role: 'chair', speaker: '議長', text: 'それでは、ご質問をお受けいたします。' },
    { role: 'shareholder', number: '0123', text: '株主番号0123の青山です。' },
    { role: 'guest', text: '不明な役' },
    { role: 'officer', text: '   ' },
  ]));
  assert.equal(lines.length, 2);
  assert.equal(dropped, 2);
  assert.equal(lines[1].id, 'L02');
  assert.equal(lines[1].speaker, '株主');
  assert.equal(lines[1].number, '0123');
  assert.equal(parseLines(JSON.stringify({ lines: [{ role: 'chair', text: 'a' }] })).lines.length, 1);
  assert.deepEqual(parseLines('not json'), { lines: [], dropped: 0 });
});
