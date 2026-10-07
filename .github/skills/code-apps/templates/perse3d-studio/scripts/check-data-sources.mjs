/**
 * check-data-sources.mjs — このアプリ固有のデプロイ前チェック（生成ツリーの外にある依存の実在確認）
 *
 * テンプレートから生成した直後でもビルドできるよう、生成サービスは遅延読み込みにしている。そのため
 * データソースを追加し忘れてもビルド・デプロイは通り、Power Apps 上で「DEMO（ブラウザ保存）」のまま動く。
 * 読み飛ばしで機能だけ無いアプリを配らないよう、デプロイ前にここで止める。
 *
 * - VITE_DATA_MODE=dataverse なのに Dataverse の生成サービスが無い → 失敗
 * - 物件ページ取得のコネクタ（操作 GetListingOverview / GetListingPage / GetListingImage）が無い → 警告（貼り付けで取り込める）
 *
 * Usage: node scripts/check-data-sources.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const env = {}
const envPath = path.join(root, ".env")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}
const servicesDir = path.join(root, "src", "generated", "services")
const services = fs.existsSync(servicesDir) ? fs.readdirSync(servicesDir).filter(f => f.endsWith("Service.ts")) : []
const errors = []
const warnings = []

if ((env.VITE_DATA_MODE ?? "").trim() === "dataverse" && !services.includes("MicrosoftDataverseService.ts")) {
  errors.push(
    "VITE_DATA_MODE=dataverse ですが、Dataverse のデータソースがアプリに追加されていません（src/generated/services/MicrosoftDataverseService.ts が無い）。" +
      "このままデプロイすると DEMO（ブラウザ保存）で動きます。" +
      "python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse --connection-ref $env:CONNECTION_REFERENCE_LOGICAL_NAME --solution-id $env:SOLUTION_ID",
  )
}

const ops = ["GetListingOverview", "GetListingPage", "GetListingImage"]
const listing = services
  .filter(f => f !== "MicrosoftDataverseService.ts")
  .map(f => ({ f, text: fs.readFileSync(path.join(servicesDir, f), "utf-8") }))
  .find(s => s.text.includes("GetListingOverview"))
if (!listing) {
  warnings.push("物件ページ取得のコネクタがアプリに追加されていません（URL からの自動取得は使えず、貼り付けで取り込みます）。python scripts/setup_listing_connector.py --add-to-app")
} else {
  const missing = ops.filter(op => !listing.text.includes(op))
  if (missing.length) {
    errors.push(`物件ページ取得のコネクタ（${listing.f}）に操作 ${missing.join(", ")} がありません。connectors/listing の定義を反映して追加し直してください: python scripts/setup_listing_connector.py --add-to-app`)
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`)
if (errors.length) {
  console.error("\n❌ データソースのチェック失敗:\n")
  for (const e of errors) console.error(`  • ${e}`)
  process.exit(1)
}
console.log("✅ データソースのチェック OK")
