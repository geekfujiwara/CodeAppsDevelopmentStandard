import { test } from 'node:test';
import assert from 'node:assert/strict';
import { charDiffRate, diffSegments } from '../src/lib/agm/text-diff.ts';
import { mergeSettings, sanitize, sourceOf, INITIAL_SETTINGS } from '../src/lib/agm/settings-core.ts';

test('文字の違いの割合は記号・空白・全角半角を無視する', () => {
  assert.equal(charDiffRate('配当の代わりなのか。', '配当の代わりなのか、'), 0);
  assert.equal(charDiffRate('３．８４億円', '3.84億円'), 0);
  assert.ok(Math.abs(charDiffRate('キャッシュ創出', 'キャッシュ喪失') - 2 / 7) < 1e-9);
});

test('違う箇所に印を付ける（共通部分は same）', () => {
  const d = diffSegments('役員報酬3点84億円', '役員報酬3.84億円');
  assert.equal(d.a.filter((s) => !s.same).map((s) => s.text).join(''), '点');
  assert.equal(d.b.filter((s) => !s.same).map((s) => s.text).join(''), '.');
  assert.equal(d.a.map((s) => s.text).join(''), '役員報酬3点84億円');
});

test('設定は 初期値 ← 組織の既定 ← この端末 の順に重なり、出どころが分かる', () => {
  const org = { answer: { deployment: 'gpt-4.1-mini' }, stt: { engine: 'compare' as const } };
  const local = { stt: { engine: 'mai' as const } };
  const s = mergeSettings(org, local);
  assert.equal(s.stt.engine, 'mai');
  assert.equal(s.answer.deployment, 'gpt-4.1-mini');
  assert.equal(s.answer.maxTokens, INITIAL_SETTINGS.answer.maxTokens);
  assert.equal(sourceOf('stt', 'engine', org, local), 'local');
  assert.equal(sourceOf('answer', 'deployment', org, local), 'org');
  assert.equal(sourceOf('answer', 'maxTokens', org, local), 'initial');
});

test('許可リストに無いデプロイ・範囲外の値は既定に戻す', () => {
  const config = {
    deployments: ['gpt-5.4-mini', 'gpt-4.1-mini'], defaultDeployment: 'gpt-5.4-mini', efforts: ['none', 'low'], defaultEffort: 'none',
    limits: { answer: { min: 200, max: 2000, default: 1200 }, identify: { min: 100, max: 600, default: 300 } },
    stt: [{ id: 'jpe', label: 'Azure', region: 'japaneast', models: ['fast'] }, { id: 'mai', label: 'MAI', region: 'southeastasia', models: ['MAI-Transcribe-1.5', 'MAI-Transcribe-2'] }],
    realtime: { region: 'japaneast' },
  };
  const s = sanitize(mergeSettings({ answer: { deployment: 'gpt-old', reasoningEffort: 'high', maxTokens: 9999 }, stt: { endpointId: 'gone', model: 'MAI-Transcribe-9' } }), config);
  assert.equal(s.answer.deployment, 'gpt-5.4-mini');
  assert.equal(s.answer.reasoningEffort, 'none');
  assert.equal(s.answer.maxTokens, 2000);
  assert.equal(s.stt.endpointId, 'mai');
  assert.equal(s.stt.model, 'MAI-Transcribe-1.5');
});
