// 開発用の模擬データ src/mock/mock-data.json を、demo-data/export/<scenario>.json から作る。
//   node scripts/build-mock.mjs [demo-1030-rain]
// （demo-data/export が無ければ npm run data:export で作る。生成物はコミットしない）
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const scenario = process.argv[2] ?? "demo-1030-rain"
const src = path.resolve(here, "..", "demo-data", "export", `${scenario}.json`)
if (!fs.existsSync(src)) {
  console.error(`見つかりません: ${src}（npm run data:export を実行してください）`)
  process.exit(1)
}
const bundle = JSON.parse(fs.readFileSync(src, "utf8"))
const today = bundle.scenario.businessDate
const from = new Date(Date.parse(today) - 15 * 86400000).toISOString().slice(0, 10)
const out = {
  setting: bundle.scenarioRows.setting[0],
  items: bundle.history.items,
  inventory: bundle.scenarioRows.inventory,
  trends: bundle.history.trends,
  daily: bundle.history.daily.filter((d) => d.date >= from),
  weather: [...bundle.history.weather.filter((w) => w.date >= from), ...bundle.scenarioRows.weather],
  events: [...bundle.history.events, ...bundle.scenarioRows.events],
}
const dest = path.resolve(here, "..", "src", "mock", "mock-data.json")
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, JSON.stringify(out))
console.log(`[OK] ${dest}（${scenario} / 日次 ${out.daily.length} 行）`)
