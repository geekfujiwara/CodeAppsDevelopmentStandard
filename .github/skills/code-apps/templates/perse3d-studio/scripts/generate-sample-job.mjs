// サンプル案件の Blender ジョブ（BuildingSpec + 5 つの提案プリセット）を作る。
// 出力: blender/samples/sample-job.json → blender/build_from_spec.py の入力例
import { readFileSync, writeFileSync } from "node:fs"
import { MATERIAL_PRESETS, DEFAULT_MATERIALS } from "../src/lib/building-spec.ts"

const spec = JSON.parse(readFileSync(new URL("../src/data/sample-spec.json", import.meta.url), "utf8"))
spec.materials = { ...DEFAULT_MATERIALS, ...spec.materials, ...MATERIAL_PRESETS[0].materials }
const job = {
  jobVersion: 1,
  projectId: "seed-sample-house",
  projectName: "サンプル邸 新築計画",
  spec,
  variants: MATERIAL_PRESETS.map(p => ({ id: p.id, name: p.name, materials: { ...DEFAULT_MATERIALS, ...p.materials } })),
  renders: ["exterior", "interior", "panorama"],
  sunStudy: true,
  samples: 64,
  resolution: "1600x900",
}
writeFileSync(new URL("../blender/samples/sample-job.json", import.meta.url), JSON.stringify(job, null, 1))
console.log(`sample-job.json: variants=${job.variants.map(v => v.id).join(",")}`)
