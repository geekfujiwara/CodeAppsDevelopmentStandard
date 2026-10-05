// CAD 取り込み・ファイル列入出力・施工位置イメージの純粋ロジックを Node で検証する。
//   node scripts/test-cad-import.mjs
// Node 24 以降（TypeScript を型除去でそのまま読み込む）。
import assert from "node:assert/strict"
import { Box3, Vector3 } from "three"
import { toCadStyle } from "./cad-sample.mjs"

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onload?.({ target: this }); this.onloadend?.({ target: this }) }) }
  }
}

const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js")
const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
const { OBJExporter } = await import("three/addons/exporters/OBJExporter.js")
const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js")
const { STLExporter } = await import("three/addons/exporters/STLExporter.js")
const binary = await import("../src/lib/binary.ts")
const cad = await import("../src/lib/models/cad-import.ts")
const snapshot = await import("../src/lib/models/task-snapshot.ts")
const { buildConstructionModel, MODEL_TYPE } = await import("../src/lib/models/index.ts")

let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (error) {
    console.error(`  ❌ ${name}\n${error.stack}`)
    process.exitCode = 1
  }
}

const BUILDING_PARAMS = "floors=4;width=9;depth=5"
const ZONES = [
  ["pile", "場所打ち杭"], ["foundation", "根切り・基礎躯体"], ["frame", "鉄骨建方"], ["slab", "床スラブ"],
  ["scaffold", "外部足場"], ["envelope", "外装"], ["roof", "屋上防水・設備"], ["mep", "設備"], ["interior", "内装"], ["exterior", "外構工事"],
].map(([zone, label]) => ({ zone, label }))

async function exportGlb(scene) {
  return new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false })
}
function patchGlbJson(buffer, mutate) {
  const view = new DataView(buffer)
  const length = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)))
  mutate(json)
  let text = JSON.stringify(json)
  while (text.length % 4) text += " "
  const jsonBytes = new TextEncoder().encode(text)
  const rest = new Uint8Array(buffer, 20 + length)
  const out = new Uint8Array(20 + jsonBytes.length + rest.length)
  out.set(new Uint8Array(buffer, 0, 12))
  const outView = new DataView(out.buffer)
  outView.setUint32(8, out.length, true)
  outView.setUint32(12, jsonBytes.length, true)
  outView.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytes, 20)
  out.set(rest, 20 + jsonBytes.length)
  return out.buffer
}

console.log("binary.ts")
await test("base64 の往復でバイト列が一致する（0x8000 を超える長さ）", () => {
  const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) & 0xff)
  assert.deepEqual(binary.base64ToBytes(binary.bytesToBase64(bytes)), bytes)
})
await test("応答の形（Uint8Array / base64 / 1 バイト 1 文字 / $content / data: URL）をバイト列に戻せる", () => {
  const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 0xff, 0x80])
  const latin1 = String.fromCharCode(...bytes)
  assert.deepEqual(binary.responseToBytes(bytes), bytes)
  assert.deepEqual(binary.responseToBytes(bytes.buffer), bytes)
  assert.deepEqual(binary.responseToBytes(binary.bytesToBase64(bytes)), bytes)
  assert.deepEqual(binary.responseToBytes(latin1), bytes)
  assert.deepEqual(binary.responseToBytes({ $content: binary.bytesToBase64(bytes) }), bytes)
  assert.deepEqual(binary.responseToBytes(`data:image/jpeg;base64,${binary.bytesToBase64(bytes)}`), bytes)
  const jpeg = String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0x10)
  assert.deepEqual([...binary.responseToBytes(jpeg)], [0xff, 0xd8, 0xff, 0xe0, 0x10])
})
await test("Range で分割取得して連結する（10 MB → 4 MB × 3 回、最後はファイル末尾で止める）", async () => {
  const data = new Uint8Array(10 * 1024 * 1024).map((_, i) => i & 0xff)
  const ranges = []
  const result = await binary.downloadInChunks(async (range) => {
    ranges.push(range)
    const [start, end] = range.replace("bytes=", "").split("-").map(Number)
    // Dataverse と同じく、末尾を超える Range は 416 で失敗させる
    if (end >= data.length) throw new Error("416 Requested Range Not Satisfiable")
    return data.subarray(start, end + 1)
  }, data.length)
  assert.equal(ranges.length, 3)
  assert.equal(ranges[1], `bytes=${4 * 1024 * 1024}-${8 * 1024 * 1024 - 1}`)
  assert.equal(ranges[2], `bytes=${8 * 1024 * 1024}-${data.length - 1}`)
  assert.deepEqual(result, data)
})
await test("Range を無視して全体が返っても 1 回で終える／途中で切れたらエラーにする", async () => {
  const data = new Uint8Array(6 * 1024 * 1024).fill(7)
  let calls = 0
  const result = await binary.downloadInChunks(async () => { calls++; return data }, data.length)
  assert.equal(calls, 1)
  assert.equal(result.length, data.length)
  await assert.rejects(binary.downloadInChunks(async () => data.subarray(0, 100), data.length), /最後まで取得/)
})
await test("保存用ファイル名を ASCII に整える／画像形式を先頭バイトで判定する", () => {
  assert.equal(binary.asciiFileName("港南 物流センター_v2.GLB", "model.glb"), "v2.glb")
  assert.equal(binary.asciiFileName("建物.glb", "model.glb"), "model.glb")
  assert.equal(binary.sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png")
  assert.equal(binary.sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff])), "image/jpeg")
})

console.log("cad-import.ts")
const model = buildConstructionModel(MODEL_TYPE.building, BUILDING_PARAMS)
const originalSize = new Box3().setFromObject(model.root).getSize(new Vector3())
const { scene: cadScene, rules: expectedRules } = toCadStyle(model)
const glb = await exportGlb(cadScene)

await test("CAD 風 GLB を GLB と判定し、事前検査を通過する", () => {
  assert.equal(cad.detectCadFormat("sample.glb", glb), "glb")
  assert.equal(cad.detectCadFormat("拡張子なし", glb), "glb")
  const inspection = cad.inspectGlb(glb)
  assert.deepEqual(inspection.errors, [])
  assert.ok(inspection.meshes > 10, `meshes=${inspection.meshes}`)
})
await test("Draco 圧縮・外部 .bin 参照・外部画像・GLB 以外・容量超過を事前に弾く", () => {
  const draco = patchGlbJson(glb, (json) => { json.extensionsUsed = ["KHR_draco_mesh_compression"]; json.extensionsRequired = ["KHR_draco_mesh_compression"] })
  assert.match(cad.inspectGlb(draco).errors.join(), /Draco/)
  const external = patchGlbJson(glb, (json) => { json.buffers[0].uri = "model.bin" })
  assert.match(cad.inspectGlb(external).errors.join(), /外部ファイル/)
  const image = patchGlbJson(glb, (json) => { json.images = [{ uri: "texture.png" }] })
  assert.match(cad.inspectGlb(image).errors.join(), /外部の画像/)
  assert.match(cad.inspectGlb(new TextEncoder().encode("not a glb file at all.....").buffer).errors.join(), /GLB/)
  assert.match(cad.inspectGlb(glb, 1024).errors.join(), /大きすぎ/)
})
await test("OBJ / STL（ASCII・バイナリ）/ FBX を判定する", () => {
  const obj = new OBJExporter().parse(cadScene)
  assert.equal(cad.detectCadFormat("a.obj", new TextEncoder().encode(obj).buffer), "obj")
  assert.equal(cad.detectCadFormat("noext", new TextEncoder().encode(`# comment\nv 0 0 0\nv 1 0 0\n`).buffer), "obj")
  const stlAscii = new STLExporter().parse(cadScene.children[1])
  assert.equal(cad.detectCadFormat("noext", new TextEncoder().encode(stlAscii).buffer), "stl")
  const stlBinary = new STLExporter().parse(cadScene.children[1], { binary: true })
  assert.equal(cad.detectCadFormat("noext", stlBinary.buffer), "stl")
  assert.equal(cad.detectCadFormat("a.fbx", new TextEncoder().encode("Kaydara FBX Binary  \0").buffer), "fbx")
  assert.equal(cad.detectCadFormat("a.txt", new TextEncoder().encode("hello").buffer), undefined)
})

const parsed = (await new GLTFLoader().parseAsync(glb, "")).scene
const normalized = cad.normalizeCadScene(parsed, { upAxis: "z", unit: "auto" })
await test("Z-up・mm のモデルを Y-up・m に正規化し、地面を原点に揃える", () => {
  assert.equal(normalized.detectedUnit, "mm")
  assert.equal(normalized.unit, "mm")
  const box = new Box3().setFromObject(normalized.root)
  const size = box.getSize(new Vector3())
  for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(size[axis] - originalSize[axis]) < 0.05, `${axis}: ${size[axis]} vs ${originalSize[axis]}`)
  assert.ok(Math.abs(box.min.y) < 1e-3, `min.y=${box.min.y}`)
  assert.ok(Math.abs(box.getCenter(new Vector3()).x) < 1e-3)
})
await test("同じモデルを Y-up と誤指定すると高さが入れ替わる（切り替えの意味を確認）", async () => {
  const again = (await new GLTFLoader().parseAsync(glb, "")).scene
  const wrong = cad.normalizeCadScene(again, { upAxis: "y", unit: "mm" })
  assert.ok(Math.abs(wrong.size[1] - originalSize.z) < 0.05)
})

const nodes = cad.listCadNodes(normalized.root)
await test("部品ノードを親 → 子の順に列挙する（カテゴリ・階グループ）", () => {
  const names = nodes.map((node) => node.name)
  for (const name of Object.keys(expectedRules)) assert.ok(names.includes(name), `${name} がない`)
  const slab = nodes.find((node) => node.name === "IfcSlab_床")
  assert.ok(names.indexOf("IfcSlab_床") < names.indexOf("IfcSlab_Level_1"))
  assert.ok(!slab.ancestors.includes("cad-pivot") && slab.ancestors.length <= 2, slab.ancestors.join(" > "))
  assert.ok(slab.meshes >= 4)
})
await test("名前から自動で対応付ける（IFC クラス名・日本語・地盤）", () => {
  const rules = cad.suggestCadRules(nodes, ZONES)
  for (const [name, rule] of Object.entries(expectedRules)) assert.equal(rules[name]?.zone, rule.zone, `${name} → ${rules[name]?.zone}`)
  assert.equal(rules["Site_Equipment_仮設・周辺"], undefined)
  // 親が対応付いたら子（階グループ）には付けない
  assert.equal(rules["IfcSlab_Level_1"], undefined)
})
await test("階グループを個別に同じ作業へ割り当てても（GLB で同名ノードに _1 が付く場合など）、下から順の施工単位になる", () => {
  const levels = Object.fromEntries(nodes.filter((node) => /^IfcColumn_Level_\d+$/.test(node.name)).map((node) => [node.name, { zone: "frame", grow: "y", kind: "build" }]))
  assert.equal(Object.keys(levels).length, 4)
  const copy = normalized.root.clone()
  cad.applyCadRules(copy, levels, ZONES)
  const bySegment = new Map()
  copy.traverse((object) => {
    if (!object.isMesh || object.userData.zone !== "frame") return
    assert.equal(object.userData.segment[1], 4)
    bySegment.set(object.userData.segment[0], Math.min(bySegment.get(object.userData.segment[0]) ?? Infinity, new Box3().setFromObject(object).min.y))
  })
  const ys = [0, 1, 2, 3].map((index) => bySegment.get(index))
  assert.deepEqual([...ys].sort((a, b) => a - b), ys)
})
await test("対応付けを適用すると、階グループが下から順の施工単位（segment）になる", () => {
  const result = cad.applyCadRules(normalized.root, expectedRules, ZONES)
  assert.ok(result.zones.includes("slab") && result.zones.includes("frame"))
  const slabs = []
  let terrain = 0
  normalized.root.traverse((object) => {
    if (!object.isMesh) return
    if (object.userData.zone === "slab") slabs.push(object)
    if (object.userData.terrain) terrain++
  })
  assert.ok(terrain >= 1)
  const segments = new Map()
  for (const mesh of slabs) {
    assert.equal(mesh.userData.segment[1], 4)
    const y = new Box3().setFromObject(mesh).min.y
    segments.set(mesh.userData.segment[0], Math.min(segments.get(mesh.userData.segment[0]) ?? Infinity, y))
  }
  const ys = [0, 1, 2, 3].map((index) => segments.get(index))
  assert.deepEqual([...ys].sort((a, b) => a - b), ys, `下の階から順になっていない: ${ys}`)
  assert.deepEqual(result.units.slab, ["IfcSlab_Level_1", "IfcSlab_Level_2", "IfcSlab_Level_3", "IfcSlab_Level_4"])
  assert.equal(result.units["@terrain"], undefined)
  const scaffold = []
  normalized.root.traverse((object) => { if (object.isMesh && object.userData.zone === "scaffold") scaffold.push(object) })
  assert.ok(scaffold.length && scaffold.every((mesh) => mesh.userData.temporary === true))
})
await test("対応付けを JSON で保存・復元できる（不正な値は既定に戻す）", () => {
  const mapping = { ...cad.defaultCadMapping("glb", "sample.glb", glb.byteLength), upAxis: "z", rules: expectedRules }
  assert.deepEqual(cad.parseCadMapping(JSON.stringify(mapping)), mapping)
  assert.equal(cad.parseCadMapping("{broken"), undefined)
  assert.equal(cad.parseCadMapping(JSON.stringify({ version: 1, rules: {}, unit: "inch", format: "dwg" })).unit, "auto")
  assert.equal(cad.defaultCadMapping("stl", "a.stl", 1).upAxis, "z")
})
await test("OBJ でもグループ名を部品として列挙できる", () => {
  const obj = new OBJLoader().parse(new OBJExporter().parse(cadScene))
  const objNodes = cad.listCadNodes(obj)
  assert.ok(objNodes.some((node) => node.name.startsWith("Mesh_")), objNodes.slice(0, 3).map((node) => node.name).join())
})

console.log("task-snapshot.ts")
await test("部位の範囲が画角に収まるカメラ位置を求める（仰角を 20〜55 度に制限）", () => {
  const box = new Box3(new Vector3(-5, 0, -5), new Vector3(5, 10, 5))
  const frame = snapshot.frameBox(box, [100, 1, 0], [0, 0, 0], 40, 16 / 9)
  const offset = frame.position.clone().sub(frame.target)
  const elevation = Math.asin(offset.y / offset.length())
  assert.ok(elevation >= Math.PI / 9 - 1e-6 && elevation <= Math.PI * 0.3 + 1e-6, `elevation=${elevation}`)
  const radius = box.getSize(new Vector3()).length() / 2
  assert.ok(offset.length() > radius / Math.sin((20 * Math.PI) / 180), `distance=${offset.length()}`)
  assert.deepEqual(frame.target.toArray(), [0, 5, 0])
})

console.log(`\n${passed} 件成功${process.exitCode ? "（失敗あり）" : ""}`)
