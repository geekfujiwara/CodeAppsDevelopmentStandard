// CAD（BIM）書き出しを模したサンプル GLB と、部位の対応付け（${PUBLISHER_PREFIX}_modelmapping 用 JSON）を書き出す。
//   npm run export:cad-sample -- --type building --params "floors=4;width=9;depth=5" --name logistics-center
// 出力: exports/cad/<name>.glb, exports/cad/<name>.mapping.json
// Dataverse への登録は ../scripts/upload_cad_model.py（リポジトリ直下）で行う。
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { toCadStyle } from "./cad-sample.mjs"

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onload?.({ target: this }); this.onloadend?.({ target: this }) }) }
  }
}

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), list[index + 1] && !list[index + 1].startsWith("--") ? list[index + 1] : "true"])
  return pairs
}, []))
const type = args.type ?? "building"
const params = args.params ?? "floors=4;width=9;depth=5"
const name = args.name ?? `${type}-cad-sample`

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "exports", "cad")
const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js")
const { buildConstructionModel, MODEL_TYPE } = await import("../src/lib/models/index.ts")
if (!(type in MODEL_TYPE)) throw new Error(`--type は ${Object.keys(MODEL_TYPE).join(" / ")} のいずれか`)

const model = buildConstructionModel(MODEL_TYPE[type], params)
const { scene, rules } = toCadStyle(model)
const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false })
// アプリの保存処理と同じく、読み込み直したモデルに対応付けを適用して施工単位（下から順）を求める
const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
const cad = await import("../src/lib/models/cad-import.ts")
const parsed = (await new GLTFLoader().parseAsync(glb.slice(0), "")).scene
const normalized = cad.normalizeCadScene(parsed, { upAxis: "z", unit: "auto" })
const zones = [...new Set(Object.values(rules).map((rule) => rule.zone))].map((zone) => ({ zone, label: zone }))
const { units } = cad.applyCadRules(normalized.root, rules, zones)
fs.mkdirSync(outDir, { recursive: true })
const fileName = `${name}.glb`
fs.writeFileSync(path.join(outDir, fileName), Buffer.from(glb))
const mapping = { version: 1, format: "glb", fileName, fileSize: glb.byteLength, upAxis: "z", unit: "auto", rules, units }
fs.writeFileSync(path.join(outDir, `${name}.mapping.json`), `${JSON.stringify(mapping, null, 2)}\n`)
console.log(`${fileName}  ${(glb.byteLength / 1024).toFixed(0)} KB  rules=${Object.keys(rules).length}  → ${outDir}`)
