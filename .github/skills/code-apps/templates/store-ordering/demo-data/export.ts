/**
 * 合成データを Dataverse に入れる形（JSON）に書き出す。
 *   node demo-data/export.ts            # すべてのシナリオ → demo-data/export/<scenario>.json
 *   node demo-data/export.ts --scenario demo-1030-rain
 * 投入は scripts/dataverse/demo_data.py が行う。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildExport } from './lib/export.ts';
import { PROJECT_ROOT } from './lib/paths.ts';
import { listScenarios } from './lib/scenario.ts';
import { DemoState } from './lib/state.ts';

const { values } = parseArgs({ options: { scenario: { type: 'string' }, out: { type: 'string' } } });
const outDir = values.out ?? join(PROJECT_ROOT, 'export');
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'store-export-'));

try {
  for (const id of values.scenario ? [values.scenario] : listScenarios()) {
    const state = new DemoState({ dbPath: join(work, `${id}.db`), scenarioId: id });
    const bundle = buildExport(state);
    state.close();
    const file = join(outDir, `${id}.json`);
    writeFileSync(file, JSON.stringify(bundle));
    const h = bundle.history;
    const s = bundle.scenarioRows;
    console.log(
      `[OK] ${file}: 商品 ${h.items.length} / 傾向 ${h.trends.length} / 日次 ${h.daily.length} / 天気 ${h.weather.length}+${s.weather.length} / イベント ${h.events.length}+${s.events.length} / 在庫 ${s.inventory.length}`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
