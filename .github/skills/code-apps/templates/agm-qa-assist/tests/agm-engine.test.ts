// 実行: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, findNumber, reconcileCards, splitClauses } from '../src/lib/agm/engine.ts';
import { extractNumbers, normalize, tokenize } from '../src/lib/agm/text.ts';
import type { Corpus, IrDoc, QaDoc } from '../src/lib/agm/types.ts';

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../data/demo/${name}.json`, import.meta.url), 'utf8')) as T;
const corpus: Corpus = {
  qa: load<QaDoc[]>('qa-master'),
  ir: load<IrDoc[]>('ir-documents'),
  keyFigures: load<{ keyFigures: Corpus['keyFigures'] }>('company').keyFigures,
};
const engine = createEngine(corpus);

test('数値は全角・桁区切りを正規化して単位ごと取り出す', () => {
  assert.equal(normalize('１，２３４億円'), '1234億円');
  assert.deepEqual(extractNumbers('売上高1,234億円、利益率12.0％、配当60円'), ['1234億円', '12.0%', '60円']);
});

test('トークンに語・2 文字 gram・数値が混ざる', () => {
  const tokens = tokenize('自社株買いの20億円');
  assert.ok(tokens.includes('=20億円'));
  assert.ok(tokens.some((t) => t.startsWith('#')));
});

test('桁区切りや全角を含む本文から正規化済みの数値を探す', () => {
  const hit = findNumber('売上高は1,234億円となりました', '1234億円');
  assert.ok(hit);
  assert.equal('売上高は1,234億円となりました'.slice(hit.index, hit.index + hit.length), '1,234億円');
  assert.equal(findNumber('11,234億円', '1234億円'), null);
});

test('読点・話題の切り替え・文末で区切り、元の位置を保つ', () => {
  const text = '配当についてですが、増配は続くのか、それから自社株買いはどうか。';
  const clauses = splitClauses(text);
  assert.deepEqual(clauses.map((c) => c.boundary), ['start', 'comma', 'cue']);
  for (const c of clauses) {
    assert.equal(text.slice(c.span.start, c.span.end), c.text);
  }
});

test('1 つの発言から 2 つの質問を分け、それぞれ正しい想定問答を 1 位にする', () => {
  const text = 'えー、株主番号0123の青山です。配当についてですが、年間60円という説明はありがたい一方で、来年以降も増配が続くのか、それから自社株買いの20億円というのは配当の代わりなのか、そこを確認したいです。';
  const segments = engine.analyze(text);
  assert.equal(segments.length, 2);
  assert.ok(['QA-001', 'QA-002'].includes(segments[0].candidates[0].doc.id));
  assert.equal(segments[1].candidates[0].doc.id, 'QA-004');
  assert.ok(!segments[0].text.includes('株主番号'), '自己紹介はハイライトに含めない');
});

test('想定問答に無い質問は新規質問として扱う', () => {
  const [segment] = engine.analyze('海外の架空都市ルミナ市に新しい販売子会社を置く予定があるのか、現地代理店との契約条件まで含めて教えてください。');
  assert.ok(segment.novel);
  assert.equal(segment.category, '新規質問');
});

test('質問でない発言からはカードを作らない', () => {
  assert.equal(engine.analyze('私は長く応援しています、以上です。今日の説明は分かりやすかったです。').length, 0);
});

test('回答案の数値はすべて IR 資料か主要数値に根拠がある', () => {
  for (const qa of corpus.qa) {
    const draft = engine.compose(qa);
    assert.deepEqual(draft.unverified, [], qa.id);
    for (const c of draft.citations.filter((x) => x.kind === 'number' && x.highlight)) {
      assert.ok(c.highlight && c.snippet.slice(c.highlight.start, c.highlight.end).length > 0);
    }
  }
});

test('根拠の無い数値は未確認として返す', () => {
  const qa = { ...corpus.qa[0], answer: '配当は年間999円です。' };
  assert.deepEqual(engine.compose(qa).unverified, ['999円']);
});

test('文字起こしが伸びてもカードの id と採用状態を保つ', () => {
  let n = 0;
  const id = () => `c${++n}`;
  const first = reconcileCards([], engine.analyze('配当についてですが、来年以降も増配が続くのか、'), id);
  first[0].adoptedQaId = 'QA-001';
  const second = reconcileCards(first, engine.analyze('配当についてですが、来年以降も増配が続くのか、それから自社株買いの20億円というのは配当の代わりなのか、'), id);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].adoptedQaId, 'QA-001');
  assert.equal(second.length, 2);
});

test('西暦は根拠を確かめる数値に含めない', async () => {
  const { extractClaims } = await import('../src/lib/agm/text.ts');
  assert.deepEqual(extractClaims('取得期間は2026年5月13日から、上限は20億円'), ['20億円']);
});
