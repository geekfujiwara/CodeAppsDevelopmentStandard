// CAD から書き出したモデル（GLB / OBJ / STL / FBX）をブラウザで解析し、工程表示用のモデルに組み立てる。
// ファイルは利用者が選んだ ArrayBuffer か Dataverse のファイル列から受け取り、fetch / blob: URL を使わずに解析する。
import { Mesh, MeshStandardMaterial, type Material, type Object3D } from "three"
import { OBJLoader } from "three/addons/loaders/OBJLoader.js"
import { STLLoader } from "three/addons/loaders/STLLoader.js"
import { disposeModel, type ConstructionModel } from "@/lib/models"
import {
  applyCadRules,
  inspectCadFile,
  listCadNodes,
  normalizeCadScene,
  type CadFormat,
  type CadMapping,
  type CadNode,
  type CadUnit,
  type CadUpAxis,
  type GlbInspection,
} from "./cad-import.ts"
import { createCspSafeGltfLoader } from "./csp-safe-gltf.ts"
import { normalize } from "./gltf-loader.ts"

const FALLBACK_COLOR = "#cbd5e1"

/** 工程表示は発光色・クリッピングを使うため、どの形式の材質も MeshStandardMaterial に揃える */
function toStandard(material: Material | Material[] | undefined): MeshStandardMaterial {
  const source = Array.isArray(material) ? material[0] : material
  if (source instanceof MeshStandardMaterial) return source
  const color = (source as { color?: { getHexString(): string } } | undefined)?.color
  const result = new MeshStandardMaterial({
    color: color ? `#${color.getHexString()}` : FALLBACK_COLOR,
    roughness: 0.78,
    metalness: 0.08,
    transparent: Boolean(source?.transparent && source.opacity < 1),
    opacity: source?.opacity ?? 1,
    side: source?.side,
  })
  const list = Array.isArray(material) ? material : material ? [material] : []
  list.forEach((item) => item.dispose())
  return result
}

function prepareMeshes(scene: Object3D): void {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.material = toStandard(object.material as Material | Material[])
    if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals()
  })
}

export async function parseCadScene(buffer: ArrayBuffer, format: CadFormat, fileName = "model"): Promise<Object3D> {
  let scene: Object3D
  if (format === "glb") {
    scene = (await createCspSafeGltfLoader().parseAsync(buffer, "")).scene
  } else if (format === "obj") {
    scene = new OBJLoader().parse(new TextDecoder().decode(buffer))
  } else if (format === "stl") {
    const geometry = new STLLoader().parse(buffer)
    const mesh = new Mesh(geometry)
    mesh.name = fileName.replace(/\.[^.]+$/, "") || "stl-model"
    scene = mesh
  } else {
    // FBX は容量の大きいローダーのため、使うときだけ読み込む
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js")
    scene = new FBXLoader().parse(buffer, "")
  }
  prepareMeshes(scene)
  return scene
}

export type CadAnalysis = {
  inspection: GlbInspection
  nodes: CadNode[]
  meshes: number
  triangles: number
  size: [number, number, number]
  unit: Exclude<CadUnit, "auto">
  detectedUnit: Exclude<CadUnit, "auto">
  suggestedUpAxis: CadUpAxis
}

/** 取り込み画面用: 検査 → 解析 → 正規化 → 対応付けの候補を返す（解析したモデルは破棄する） */
export async function analyzeCadFile(buffer: ArrayBuffer, format: CadFormat, fileName: string, options: { upAxis: CadUpAxis; unit: CadUnit }): Promise<CadAnalysis> {
  const inspection = inspectCadFile(buffer, format)
  if (inspection.errors.length) {
    return { inspection, nodes: [], meshes: 0, triangles: 0, size: [0, 0, 0], unit: "m", detectedUnit: "m", suggestedUpAxis: "y" }
  }
  const scene = await parseCadScene(buffer, format, fileName)
  normalize(scene)
  const normalized = normalizeCadScene(scene, options)
  const nodes = listCadNodes(scene)
  let meshes = 0
  let triangles = 0
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    meshes++
    const geometry = object.geometry
    triangles += Math.floor((geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / 3)
  })
  if (triangles > 3_000_000) inspection.warnings.push(`三角形が ${(triangles / 1e6).toFixed(1)} 百万あり、表示が重くなります。CAD 側で詳細度を下げて書き出すことを推奨します。`)
  disposeModel(normalized.root)
  return { inspection, nodes, meshes, triangles, size: normalized.size, unit: normalized.unit, detectedUnit: normalized.detectedUnit, suggestedUpAxis: normalized.suggestedUpAxis }
}

/** 保存済み（またはプレビュー中）の対応付けを適用し、工程表示用のモデルを組み立てる */
export async function loadCadModel(buffer: ArrayBuffer, mapping: CadMapping, zones: Array<{ zone: string; label: string }>): Promise<ConstructionModel & { units: Record<string, string[]> }> {
  const inspection = inspectCadFile(buffer, mapping.format)
  if (inspection.errors.length) throw new Error(inspection.errors.join(" "))
  const scene = await parseCadScene(buffer, mapping.format, mapping.fileName)
  normalize(scene)
  const normalized = normalizeCadScene(scene, mapping)
  const { units } = applyCadRules(normalized.root, mapping.rules, zones)
  return { title: mapping.fileName, root: normalized.root, camera: normalized.camera, target: normalized.target, units }
}

/** 保存前に、作業ごとの施工単位（下から順の名前）を計算する */
export async function summarizeCadUnits(buffer: ArrayBuffer, mapping: CadMapping, zones: Array<{ zone: string; label: string }>): Promise<Record<string, string[]>> {
  const model = await loadCadModel(buffer, mapping, zones)
  disposeModel(model.root)
  return model.units
}
