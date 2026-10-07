/**
 * シードから SQLite を再生成し、合成データに「気づける癖」が出ているかを表示する。
 *   node demo-data/generate.ts [--scenario demo-1030-rain] [--db demo-data/store.db]
 */
import { parseArgs } from 'node:util';
import { DemoState } from './lib/state.ts';
import { analyzeHabits } from './lib/habits.ts';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string' },
    db: { type: 'string' },
  },
});

const state = new DemoState({ scenarioId: values.scenario, dbPath: values.db });
const b = state.lastBuild!;
console.log(`[OK] ${b.dbPath} を生成しました（シナリオ ${b.scenario} / 営業日 ${b.businessDate} / 販売 ${b.salesRows} 行 / 廃棄 ${b.wasteRows} 行 / ${b.ms}ms）`);

const report = analyzeHabits(state.db);
let ok = true;
for (const c of report) {
  console.log(`${c.pass ? '  ✅' : '  ❌'} ${c.label}: ${c.detail}`);
  ok &&= c.pass;
}
state.close();
if (!ok) {
  console.error('[NG] 合成データに期待した癖が出ていません');
  process.exit(1);
}
