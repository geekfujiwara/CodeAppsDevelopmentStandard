import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingMarkdown, meetingStats, questionsCsv, timeSlot, type StatQuestion, type StatTurn } from '../src/lib/agm/meeting-stats.ts';

const turns: StatTurn[] = [
  { id: 't1', shareholderNumber: '0236', shareholderName: '藤原 健太', startedAt: '2026-06-25T01:05:00Z', durationSec: 60 },
  { id: 't2', shareholderNumber: '', shareholderName: '', startedAt: '2026-06-25T01:20:00Z', durationSec: 30 },
  { id: 't3', shareholderNumber: '0236', shareholderName: '藤原 健太', startedAt: '2026-06-25T01:40:00Z', durationSec: 90 },
];
const q = (id: string, turnId: string, seq: number, category: string, qaCode: string, rating = 0, extra: Partial<StatQuestion> = {}): StatQuestion => ({
  id, turnId, seq, category, excerpt: `質問 ${id}, "引用"`, qaCode, aiDraft: '', answerDraft: '', rating, ratingComment: '', ...extra,
});
const questions = [q('q1', 't1', 1, '配当', 'QA-001', 5, { aiDraft: '回答\n2 行目' }), q('q2', 't1', 2, '配当', '', 3), q('q3', 't2', 1, 'ガバナンス', 'QA-015'), q('q4', 't3', 1, 'サステナビリティ', 'QA-020', 4)];

test('総会の集計: 件数・一致・評価・分類・時間帯', () => {
  const s = meetingStats(turns, questions);
  assert.equal(s.turns, 3);
  assert.equal(s.shareholders, 1);
  assert.equal(s.unidentified, 1);
  assert.equal(s.questions, 4);
  assert.equal(s.matched, 3);
  assert.equal(s.novel, 1);
  assert.equal(s.aiDrafts, 1);
  assert.equal(s.rated, 3);
  assert.equal(s.averageRating, 4);
  assert.equal(s.totalMinutes, 3);
  assert.deepEqual(s.byCategory[0], { category: '配当', count: 2 });
  assert.equal(s.byTime.reduce((n, x) => n + x.count, 0), 4);
  assert.deepEqual(s.ratings.map((r) => r.count), [0, 0, 1, 1, 1]);
  assert.deepEqual(s.topShareholders[0], { number: '0236', name: '藤原 健太', questions: 3 });
});

test('時間帯は 15 分刻み・読めない日時は「不明」', () => {
  assert.match(timeSlot('2026-06-25T01:44:00Z'), /^\d\d:(00|15|30|45)$/);
  assert.equal(timeSlot('x'), '不明');
});

test('CSV は BOM 付きで、カンマ・引用符・改行をエスケープする', () => {
  const csv = questionsCsv(turns, questions);
  assert.ok(csv.startsWith('\uFEFF株主番号,'));
  assert.ok(csv.includes('"質問 q1, ""引用"""'));
  assert.equal(csv.trim().split('\r\n').length, 5);
  assert.ok(csv.includes('（新規）'));
});

test('まとめの Markdown は株主番号ごとに質問・評価・回答案を並べる', () => {
  const md = meetingMarkdown('第42期 定時株主総会', '2026-06-25', turns, questions, new Date('2026-06-25T09:00:00Z'));
  assert.ok(md.startsWith('# 第42期 定時株主総会 質疑応答の記録'));
  assert.ok(md.includes('### 株主番号 未確認'));
  assert.ok(md.includes('★★★★★'));
  assert.ok(md.includes('> 回答\n> 2 行目'));
  assert.ok(md.includes('| 配当 | 2 |'));
});
