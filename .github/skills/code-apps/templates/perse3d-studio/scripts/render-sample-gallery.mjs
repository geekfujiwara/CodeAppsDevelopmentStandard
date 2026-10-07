// Blender の出力例（public/samples/blender/）を作り直す。サンプル案件の spec + 標準プリセット + 日影図 + 間接光の焼き込み + HDRI。
//
//   node scripts/render-sample-gallery.mjs [--samples 64] [--res 1280x720] [--hdri .tools/hdri/<file>.hdr]
//
// 出力: renders/*.png → 幅 1280 の JPEG（public/samples/blender/*.jpg）、model.glb → sample-model.glb、quantities.json
// 所要時間: GPU（OptiX）で 15 分ほど。Blender は .tools/blender-*/blender.exe（無ければ PATH の blender）
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_MATERIALS, MATERIAL_PRESETS } from "../src/lib/building-spec.ts"
import { CATALOG } from "../src/lib/furniture.ts"

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []))
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const tools = join(root, ".tools")
const blender = readdirSync(tools).filter(d => d.startsWith("blender-")).map(d => join(tools, d, "blender.exe")).find(existsSync) ?? "blender"
const hdri = args.hdri ?? (existsSync(join(tools, "hdri")) ? readdirSync(join(tools, "hdri")).filter(f => f.endsWith(".hdr")).map(f => join(tools, "hdri", f))[0] : undefined)
const out = join(tools, "sample-gallery")
const dest = join(root, "public", "samples", "blender")

const spec = JSON.parse(readFileSync(join(root, "src", "data", "sample-spec.json"), "utf8"))
const job = {
  jobVersion: 1,
  projectId: "seed-sample-house",
  projectName: spec.name,
  spec,
  variants: MATERIAL_PRESETS.map(p => ({ id: p.id, name: p.name, materials: { ...DEFAULT_MATERIALS, ...p.materials } })),
  renders: ["exterior", "interior", "panorama"],
  sunStudy: true,
  lightmap: 1024,
  samples: Number(args.samples ?? 64),
  resolution: args.res ?? "1280x720",
  furnitureCatalog: CATALOG,
}
mkdirSync(out, { recursive: true })
const jobPath = join(out, "job.json")
writeFileSync(jobPath, JSON.stringify(job))
const t0 = Date.now()
execFileSync(blender, ["-b", "--factory-startup", "--python", join(root, "blender", "build_from_spec.py"), "--", "--spec", jobPath, "--out", out, "--variants", ...(hdri ? ["--hdri", hdri] : [])], { stdio: "inherit" })
console.log(`[gallery] Blender ${(Date.now() - t0) / 1000 | 0}s${hdri ? `（HDRI: ${hdri}）` : ""}`)

mkdirSync(dest, { recursive: true })
execFileSync("python", ["-c", `
import sys
from pathlib import Path
from PIL import Image
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
for p in sorted(src.glob("*.png")):
    im = Image.open(p).convert("RGB")
    w = 2048 if p.stem == "panorama" else 1280
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(dst / (p.stem + ".jpg"), quality=82, optimize=True, progressive=True)
    print(f"{p.stem}.jpg {(dst / (p.stem + '.jpg')).stat().st_size:,} bytes")
`, join(out, "renders"), dest], { stdio: "inherit" })
copyFileSync(join(out, "model.glb"), join(dest, "sample-model.glb"))
copyFileSync(join(out, "quantities.json"), join(dest, "quantities.json"))
console.log(`[gallery] ${dest}`)
