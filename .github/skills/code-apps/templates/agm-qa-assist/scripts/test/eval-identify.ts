// 株主の照合（名簿の候補 → 生成 AI）を評価セットで測る。
// 事前に: python scripts/test/fetch_answer_ticket.py --out .mcp/answer-ticket.json
// 実行:   node scripts/test/eval-identify.ts [--json spec/eval/identify.json]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { rivalsOf, shortlist } from '../../src/lib/agm/match.ts';
import type { Shareholder } from '../../src/lib/agm/shareholders.ts';

const load = (n: string) => JSON.parse(readFileSync(new URL(`../../data/demo/${n}.json`, import.meta.url), 'utf8'));
const register: Shareholder[] = load('shareholders');
const cases: { id: string; utterance: string; expected: string | null; note: string }[] = load('identify-cases');
const ticket = JSON.parse(readFileSync(new URL('../../.mcp/answer-ticket.json', import.meta.url), 'utf8')) as { ticket: string; endpoint: string };
const endpoint = ticket.endpoint.replace(/\/answer\/stream$/, '/shareholder/identify');

const rows = [];
for (const c of cases) {
  const candidates = shortlist(register, c.utterance);
  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Ticket ${ticket.ticket}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ utterance: c.utterance, candidates: candidates.map((x) => ({ number: x.shareholder.number, name: x.shareholder.name, kana: x.shareholder.kana })) }),
  });
  const ms = Math.round(performance.now() - t0);
  const body = (await res.json()) as { number?: string | null; confidence?: number; reason?: string; error?: string };
  if (!res.ok) console.warn(c.id, res.status, JSON.stringify(body), candidates.length);
  const r = { number: body.number ?? null, confidence: body.confidence ?? 0, reason: body.reason ?? body.error ?? '' };
  // アプリと同じ判定: 紛らわしい候補がいれば自動では決めない
  const rivals = rivalsOf(r.number, candidates).map((x) => x.shareholder.number);
  const autoApplied = !!r.number && r.confidence >= 0.8 && !rivals.length;
  const shown = autoApplied ? [] : [r.number, ...rivals, ...candidates.map((x) => x.shareholder.number)].filter(Boolean).slice(0, 5);
  rows.push({
    id: c.id,
    expected: c.expected ?? '（なし）',
    got: r.number ?? '（なし）',
    correct: r.number === c.expected,
    // 自動で正しく決まる、または自動で決めずに正解を候補（上位 5）として出せた
    safe: autoApplied ? r.number === c.expected : c.expected === null ? !r.number || !autoApplied : shown.includes(c.expected),
    rivals: rivals.join(','),
    conf: +r.confidence.toFixed(2),
    auto: autoApplied,
    wrongAuto: autoApplied && r.number !== c.expected,
    top1: candidates[0]?.shareholder.number,
    ms,
    reason: r.reason.slice(0, 40),
  });
}
console.table(rows);
const summary = {
  cases: rows.length,
  accuracy: +(rows.filter((r) => r.correct).length / rows.length).toFixed(3),
  safe: +(rows.filter((r) => r.safe).length / rows.length).toFixed(3),
  autoApplied: rows.filter((r) => r.auto).length,
  wrongAutoApplied: rows.filter((r) => r.wrongAuto).length,
  inventedNumbers: rows.filter((r) => r.got !== '（なし）' && !register.some((s) => s.number === r.got)).length,
  p50Ms: [...rows.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  maxMs: Math.max(...rows.map((r) => r.ms)),
};
console.log(JSON.stringify(summary, null, 2));
const i = process.argv.indexOf('--json');
if (i > 0) {
  mkdirSync(dirname(process.argv[i + 1]), { recursive: true });
  writeFileSync(process.argv[i + 1], JSON.stringify({ summary, rows }, null, 2));
}
