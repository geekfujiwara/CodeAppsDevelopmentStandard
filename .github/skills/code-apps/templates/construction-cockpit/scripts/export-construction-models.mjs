// 工事種別ごとの 3D 施工モデルを GLB に書き出す。
//   npm run export:models          … アプリに同梱する GLB（src/assets/models/）を更新する
//   npm run export:models -- --all … 全種別を exports/models/ に書き出す（BIM/CIM 連携の確認用）
// Node 24 以降で実行する（TypeScript のモデル生成コードを型除去でそのまま読み込む）。
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// GLTFExporter のバイナリ出力は FileReader を使うため、Node 用の最小実装を用意する
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onload?.({ target: this }); this.onloadend?.({ target: this }) })
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`
        this.onload?.({ target: this })
        this.onloadend?.({ target: this })
      })
    }
  }
}

const all = process.argv.includes("--all")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = all ? path.join(root, "exports", "models") : path.join(root, "src", "assets", "models")
const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js")
const { mergeVertices } = await import("three/addons/utils/BufferGeometryUtils.js")
const { BUNDLED_MODELS, EXPORTABLE_MODELS } = await import("../src/lib/models/index.ts")

fs.mkdirSync(outDir, { recursive: true })
const exporter = new GLTFExporter()
for (const [name, build] of Object.entries(all ? EXPORTABLE_MODELS : BUNDLED_MODELS)) {
  const model = build()
  model.root.userData = { ...model.root.userData, title: model.title, camera: model.camera, target: model.target, source: name }
  let vertices = 0
  const zones = new Set()
  model.root.traverse((object) => {
    if (!object.isMesh) return
    // テクスチャを使わないため UV を捨て、同一頂点を結合してインデックス化する（容量を約半分にする）
    let geometry = object.geometry
    if (geometry.getAttribute("uv")) geometry.deleteAttribute("uv")
    if (!geometry.index) geometry = mergeVertices(geometry, 1e-4)
    object.geometry = geometry
    vertices += geometry.getAttribute("position").count
    if (object.userData.zone) zones.add(object.userData.zone)
  })
  const glb = await exporter.parseAsync(model.root, { binary: true, onlyVisible: false })
  const file = path.join(outDir, `${name}.glb`)
  fs.writeFileSync(file, Buffer.from(glb))
  console.log(`${name}.glb  ${(fs.statSync(file).size / 1024).toFixed(0)} KB  vertices=${vertices}  zones=${[...zones].join(",")}`)
}
