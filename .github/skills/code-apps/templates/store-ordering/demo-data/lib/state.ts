import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROJECT_ROOT } from './paths.ts';
import { DEFAULT_SCENARIO, loadScenario, type Scenario } from './scenario.ts';
import { buildDatabase, type BuildResult } from './seed.ts';

export interface DemoClock {
  date: string;
  time: string;
  hour: number;
  minutes: number;
  iso: string;
}

export interface StateOptions {
  dbPath?: string;
  scenarioId?: string;
  /** "HH:MM" または "YYYY-MM-DDTHH:MM"。台本の時刻を上書きする */
  now?: string;
}

export const DEFAULT_DB_PATH = join(PROJECT_ROOT, 'store.db');

/** SQLite と台本（シナリオ）とデモ用の時計をまとめて持つ。リセットで初期状態に戻せる。 */
export class DemoState {
  readonly dbPath: string;
  db!: DatabaseSync;
  scenario!: Scenario;
  private nowOverride?: string;
  lastBuild?: BuildResult;

  constructor(opts: StateOptions = {}) {
    this.dbPath = opts.dbPath ?? process.env.DB_PATH ?? DEFAULT_DB_PATH;
    this.reset({ scenarioId: opts.scenarioId ?? process.env.SCENARIO ?? DEFAULT_SCENARIO, now: opts.now ?? process.env.DEMO_NOW });
  }

  reset(opts: { scenarioId?: string; now?: string } = {}): BuildResult {
    const scenario = loadScenario(opts.scenarioId ?? this.scenario?.id ?? DEFAULT_SCENARIO);
    this.close();
    mkdirSync(dirname(this.dbPath), { recursive: true });
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      if (existsSync(this.dbPath + suffix)) rmSync(this.dbPath + suffix);
    }
    const db = new DatabaseSync(this.dbPath);
    const result = buildDatabase(db, scenario);
    this.db = db;
    this.scenario = scenario;
    this.nowOverride = opts.now;
    this.lastBuild = { dbPath: this.dbPath, ...result };
    return this.lastBuild;
  }



  now(): DemoClock {
    let date = this.scenario.businessDate;
    let time = this.scenario.demoTime;
    if (this.nowOverride) {
      const m = /^(?:(\d{4}-\d{2}-\d{2})T)?(\d{2}:\d{2})$/.exec(this.nowOverride);
      if (!m) throw new Error(`DEMO_NOW の形式が不正です: ${this.nowOverride}（例: 09:30 / 2026-10-30T09:30）`);
      date = m[1] ?? date;
      time = m[2];
    }
    const [h, mi] = time.split(':').map(Number);
    return { date, time, hour: h, minutes: h * 60 + mi, iso: `${date}T${time}` };
  }

  close(): void {
    if (this.db?.isOpen) this.db.close();
  }
}
