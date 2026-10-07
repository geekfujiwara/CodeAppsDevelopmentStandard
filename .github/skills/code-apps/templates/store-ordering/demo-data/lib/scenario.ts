import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { PROJECT_ROOT } from './paths.ts';

const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const weatherDaySchema = z.object({
  condition: z.enum(['晴れ', 'くもり', '雨']),
  temp_max: z.number(),
  temp_min: z.number(),
  precip_prob: z.number().min(0).max(100),
});

export const eventSchema = z.object({
  date,
  start: time,
  end: time,
  venue: z.string(),
  name: z.string(),
  scale: z.number().int().positive(),
  distance_m: z.number().int().positive(),
});

export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  businessDate: date,
  demoTime: time,
  liveWeather: z.boolean().default(false),
  weather: z.record(date, weatherDaySchema),
  events: z.array(eventSchema),
  inventoryOverrides: z.record(z.string(), z.number().int().min(0)),
  storyNotes: z.array(z.string()).default([]),
});

export type WeatherDay = z.infer<typeof weatherDaySchema>;
export type EventDef = z.infer<typeof eventSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

export const SCENARIO_DIR = join(PROJECT_ROOT, 'scenarios');
export const DEFAULT_SCENARIO = 'demo-1030-rain';

export function listScenarios(): string[] {
  return readdirSync(SCENARIO_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function loadScenario(id: string): Scenario {
  if (!/^[a-z0-9-]+$/.test(id) || !listScenarios().includes(id)) {
    throw new Error(`シナリオ「${id}」は見つかりません。使えるシナリオ: ${listScenarios().join(', ')}`);
  }
  const raw = JSON.parse(readFileSync(join(SCENARIO_DIR, `${id}.json`), 'utf8'));
  const parsed = scenarioSchema.parse(raw);
  if (parsed.id !== id) throw new Error(`シナリオ ${id}.json の id が一致しません: ${parsed.id}`);
  if (!parsed.weather[parsed.businessDate]) {
    throw new Error(`シナリオ ${id} に営業日 ${parsed.businessDate} の天気がありません`);
  }
  return parsed;
}
