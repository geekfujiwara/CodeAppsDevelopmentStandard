// CAD（BIM/CIM）から書き出した GLB を工程の 3D モデルとして使うための前処理。
// ブラウザと Node（テスト・サンプル生成）の両方で動くよう、three 以外に依存しない。
//
// 1. inspectGlb   … 解析前に GLB の構造を検査する（外部参照・未対応の圧縮拡張・容量）
// 2. normalizeCadScene … Z-up → Y-up、mm/cm → m、原点合わせ
// 3. listCadNodes / suggestCadRules … 対応付けの候補（ノード）と、名前からの自動対応付け
// 4. applyCadRules … ノード → 作業（部位キー）を割り当て、配下のメッシュを施工順に分割する
import { Box3, Group, Mesh, Vector3, type Object3D } from "three"
import type { GrowAxis, Vec3, ZoneInfo } from "./kit.ts"

export const CAD_MAX_BYTES = 50 * 1024 * 1024
export const CAD_TRIANGLE_WARNING = 3_000_000
/** 地盤として扱う（施工対象ではなく、透過表示の対象にする） */
export const CAD_TERRAIN = "@terrain"
export { CAD_MODEL_URL } from "./model-source.ts"

export type CadUnit = "auto" | "m" | "cm" | "mm"
export type CadUpAxis = "y" | "z"
export type CadFormat = "glb" | "obj" | "stl" | "fbx"
export type CadRuleKind = "build" | "remove" | "temporary"
export type CadRule = { zone: string; grow?: GrowAxis; kind?: CadRuleKind }
export type CadMapping = {
  version: 1
  format: CadFormat
  fileName: string
  fileSize: number
  upAxis: CadUpAxis
  unit: CadUnit
  rules: Record<string, CadRule>
  /**
   * 作業（部位キー）ごとの施工単位の名前（下から順）。保存時に計算する。
   * 進捗 p% のとき先頭から floor(p/100 × 件数) 個が完成として 3D に表示される。
   * Copilot Studio はこれを読み、「3 階まで完了」などの報告を進捗率に換算する。
   */
  units?: Record<string, string[]>
  savedAt?: string
}

export const CAD_FORMAT_LABEL: Record<CadFormat, string> = {
  glb: "glTF バイナリ（.glb）",
  obj: "Wavefront OBJ（.obj）",
  stl: "STL（.stl）",
  fbx: "FBX（.fbx）",
}
export const CAD_ACCEPT = ".glb,.obj,.stl,.fbx"
/** 書き出し元で Z-up が既定の形式（OBJ/STL/FBX は CAD の座標をそのまま出すことが多い） */
const DEFAULT_UP: Record<CadFormat, CadUpAxis> = { glb: "y", obj: "y", stl: "z", fbx: "y" }

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))

/** 拡張子と先頭バイトから形式を判定する（拡張子が誤っていても中身を優先する） */
export function detectCadFormat(fileName: string, buffer: ArrayBuffer): CadFormat | undefined {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512))
  if (ascii(bytes, 0, 4) === "glTF") return "glb"
  if (ascii(bytes, 0, 18) === "Kaydara FBX Binary") return "fbx"
  const ext = fileName.toLowerCase().split(".").pop() ?? ""
  if (ext === "fbx" && /FBXHeaderExtension/.test(ascii(bytes, 0, bytes.length))) return "fbx"
  if (ext === "stl") return "stl"
  if (ext === "obj") return "obj"
  // 拡張子が無い場合: ASCII STL は "solid"、バイナリ STL は 84 + 50n バイト、OBJ は頂点行を持つ
  const head = ascii(bytes, 0, bytes.length)
  if (/^solid\s/.test(head) && /facet/.test(head)) return "stl"
  if (buffer.byteLength >= 84 && (buffer.byteLength - 84) % 50 === 0 && new DataView(buffer).getUint32(80, true) * 50 + 84 === buffer.byteLength) return "stl"
  if (/^(#.*\n|\s*\n)*\s*(v|o|g|mtllib)\s/m.test(head)) return "obj"
  return undefined
}

/** 形式に応じた事前検査。GLB は構造まで検査し、その他は容量と空ファイルだけを確認する */
export function inspectCadFile(buffer: ArrayBuffer, format: CadFormat, maxBytes = CAD_MAX_BYTES): GlbInspection {
  if (format === "glb") return inspectGlb(buffer, maxBytes)
  const result: GlbInspection = { errors: [], warnings: [], generator: CAD_FORMAT_LABEL[format], nodes: 0, meshes: 0, extensions: [] }
  if (buffer.byteLength > maxBytes) {
    result.errors.push(`ファイルが大きすぎます（${(buffer.byteLength / 1048576).toFixed(1)} MB）。${Math.round(maxBytes / 1048576)} MB 以下に軽量化してください。`)
  } else if (buffer.byteLength < 84) {
    result.errors.push("ファイルが空か、形状を含んでいません。")
  }
  if (format === "obj") result.warnings.push("OBJ の材質（.mtl）とテクスチャは読み込みません。部位ごとの色は工程の状態で表示します。")
  if (format === "stl") result.warnings.push("STL は部品の名前を持たないため、モデル全体を 1 つの作業に対応付けます。部位ごとに進捗を見たい場合は GLB で書き出してください。")
  if (format === "fbx") result.warnings.push("FBX のテクスチャは読み込みません（Code Apps の CSP で blob: URL を使えないため）。")
  return result
}

export type GlbInspection = {
  errors: string[]
  warnings: string[]
  generator: string
  nodes: number
  meshes: number
  extensions: string[]
}

const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  KHR_draco_mesh_compression: "Draco 圧縮",
  EXT_meshopt_compression: "meshopt 圧縮",
  KHR_texture_basisu: "KTX2（Basis Universal）テクスチャ",
}

export const UNIT_SCALE: Record<Exclude<CadUnit, "auto">, number> = { m: 1, cm: 0.01, mm: 0.001 }
export const UNIT_LABEL: Record<CadUnit, string> = { auto: "自動判定", m: "メートル（m）", cm: "センチメートル（cm）", mm: "ミリメートル（mm）" }

export function defaultCadMapping(format: CadFormat, fileName: string, fileSize: number): CadMapping {
  return { version: 1, format, fileName, fileSize, upAxis: DEFAULT_UP[format], unit: "auto", rules: {} }
}

export function parseCadMapping(text: string): CadMapping | undefined {
  if (!text.trim()) return undefined
  try {
    const value = JSON.parse(text) as Partial<CadMapping>
    if (value.version !== 1 || typeof value.rules !== "object" || !value.rules) return undefined
    return {
      version: 1,
      format: value.format && value.format in CAD_FORMAT_LABEL ? value.format : "glb",
      fileName: String(value.fileName ?? "model.glb"),
      fileSize: Number(value.fileSize ?? 0),
      upAxis: value.upAxis === "z" ? "z" : "y",
      unit: value.unit && value.unit in UNIT_LABEL ? value.unit : "auto",
      rules: value.rules,
      ...(value.units && typeof value.units === "object" ? { units: value.units } : {}),
      ...(value.savedAt ? { savedAt: value.savedAt } : {}),
    }
  } catch {
    return undefined
  }
}

/** GLB のヘッダーと JSON チャンクだけを読み、読み込めない構成を事前に弾く（three で解析する前に実行する） */
export function inspectGlb(buffer: ArrayBuffer, maxBytes = CAD_MAX_BYTES): GlbInspection {
  const result: GlbInspection = { errors: [], warnings: [], generator: "", nodes: 0, meshes: 0, extensions: [] }
  if (buffer.byteLength > maxBytes) {
    result.errors.push(`ファイルが大きすぎます（${(buffer.byteLength / 1048576).toFixed(1)} MB）。${Math.round(maxBytes / 1048576)} MB 以下に軽量化してください。`)
    return result
  }
  const view = new DataView(buffer)
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    result.errors.push("GLB（glTF バイナリ）ではありません。CAD から .glb 形式で書き出してください。")
    return result
  }
  if (view.getUint32(4, true) !== 2) {
    result.errors.push("glTF 2.0 以外の GLB には対応していません。")
    return result
  }
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) {
    result.errors.push("GLB の JSON チャンクを読み取れません。ファイルが破損している可能性があります。")
    return result
  }
  let json: {
    asset?: { generator?: string }
    nodes?: unknown[]
    meshes?: unknown[]
    buffers?: Array<{ uri?: string }>
    images?: Array<{ uri?: string }>
    extensionsUsed?: string[]
    extensionsRequired?: string[]
  }
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)))
  } catch {
    result.errors.push("GLB の JSON チャンクを解析できません。")
    return result
  }
  result.generator = json.asset?.generator ?? ""
  result.nodes = json.nodes?.length ?? 0
  result.meshes = json.meshes?.length ?? 0
  result.extensions = [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])]
  for (const name of result.extensions) {
    if (UNSUPPORTED_EXTENSIONS[name]) result.errors.push(`${UNSUPPORTED_EXTENSIONS[name]}（${name}）には対応していません。CAD の書き出し設定で圧縮を無効にしてください。`)
  }
  if ((json.buffers ?? []).some((item) => item.uri !== undefined)) {
    result.errors.push("外部ファイル（.bin）を参照しています。Code Apps では外部ファイルを読めないため、1 ファイルの .glb として書き出してください。")
  }
  if ((json.images ?? []).some((item) => item.uri !== undefined && !item.uri.startsWith("data:"))) {
    result.errors.push("外部の画像ファイルを参照しています。テクスチャを埋め込んだ .glb として書き出してください。")
  }
  if (!result.meshes) result.errors.push("メッシュ（形状）が含まれていません。")
  return result
}

/** バウンディングボックスの対角長からモデルの単位を推定する（建設モデルは数 m 〜 数 km） */
export function detectCadUnit(diagonal: number): Exclude<CadUnit, "auto"> {
  if (diagonal >= 20_000) return "mm"
  return "m"
}

/** Y-up の glTF では本来不要だが、CAD によっては Z-up のまま書き出すため、最も薄い軸が Z なら Z-up を提案する */
export function suggestUpAxis(size: Vector3): CadUpAxis {
  return size.z < size.y * 0.5 && size.z < size.x * 0.5 ? "z" : "y"
}

export type NormalizedCad = {
  root: Group
  size: Vec3
  unit: Exclude<CadUnit, "auto">
  detectedUnit: Exclude<CadUnit, "auto">
  suggestedUpAxis: CadUpAxis
  camera: Vec3
  target: Vec3
}

/** CAD の座標系を工程表示用に揃える。元のシーンは pivot の子として残し、ノード名・階層は変えない */
export function normalizeCadScene(scene: Object3D, options: { upAxis: CadUpAxis; unit: CadUnit }): NormalizedCad {
  scene.updateMatrixWorld(true)
  const raw = new Box3().setFromObject(scene).getSize(new Vector3())
  const suggestedUpAxis = suggestUpAxis(raw)
  const pivot = new Group()
  pivot.name = "cad-pivot"
  pivot.add(scene)
  if (options.upAxis === "z") pivot.rotation.x = -Math.PI / 2
  pivot.updateMatrixWorld(true)
  const detectedUnit = detectCadUnit(new Box3().setFromObject(pivot).getSize(new Vector3()).length())
  const unit = options.unit === "auto" ? detectedUnit : options.unit
  pivot.scale.setScalar(UNIT_SCALE[unit])
  pivot.updateMatrixWorld(true)
  const box = new Box3().setFromObject(pivot)
  const center = box.getCenter(new Vector3())
  pivot.position.set(-center.x, -box.min.y, -center.z)
  const root = new Group()
  root.name = "cad-root"
  root.add(pivot)
  root.updateMatrixWorld(true)
  const size = box.getSize(new Vector3())
  const radius = Math.max(5, size.length() / 2)
  return {
    root,
    size: [size.x, size.y, size.z],
    unit,
    detectedUnit,
    suggestedUpAxis,
    camera: [radius * 1.05, radius * 0.75, radius * 1.25],
    target: [0, size.y * 0.3, 0],
  }
}

export type CadNode = {
  name: string
  depth: number
  /** 同じ名前のノードの数（階ごとに同名のグループがある CAD が多い） */
  occurrences: number
  meshes: number
  triangles: number
  ancestors: string[]
  /** extras やノード名の規約で既に部位が決まっている場合の部位キー */
  presetZone?: string
}

function triangleCount(mesh: Mesh): number {
  const geometry = mesh.geometry
  const count = geometry.index ? geometry.index.count : geometry.getAttribute("position")?.count ?? 0
  return Math.floor(count / 3)
}

/** normalizeCadScene が追加する内部ノード（対応付けの候補に出さない） */
const INTERNAL_NODES = new Set(["cad-root", "cad-pivot"])

/** 対応付けの候補になる名前付きノードを、親 → 子の順に列挙する */
export function listCadNodes(scene: Object3D, limit = 400): CadNode[] {
  const nodes = new Map<string, CadNode>()
  const visit = (object: Object3D, depth: number, ancestors: string[]): { meshes: number; triangles: number; zones: Set<string> } => {
    let meshes = 0
    let triangles = 0
    const zones = new Set<string>()
    if (object instanceof Mesh) {
      meshes = 1
      triangles = triangleCount(object)
      const zone = (object.userData as { zone?: string }).zone
      zones.add(zone ?? "")
    }
    const name = object.name.trim()
    const named = depth > 0 && name !== "" && !INTERNAL_NODES.has(name)
    const entry = named ? nodes.get(name) : undefined
    const childAncestors = named ? [...ancestors, name] : ancestors
    if (named && !entry && nodes.size < limit) {
      nodes.set(name, { name, depth, occurrences: 0, meshes: 0, triangles: 0, ancestors })
    }
    for (const child of object.children) {
      const sub = visit(child, depth + 1, childAncestors)
      meshes += sub.meshes
      triangles += sub.triangles
      sub.zones.forEach((zone) => zones.add(zone))
    }
    const node = named ? nodes.get(name) : undefined
    if (node) {
      node.occurrences += 1
      node.meshes += meshes
      node.triangles += triangles
      if (zones.size === 1) {
        const [zone] = [...zones]
        if (zone) node.presetZone = zone
      }
    }
    return { meshes, triangles, zones }
  }
  visit(scene, 0, [])
  return [...nodes.values()].filter((node) => node.meshes > 0)
}

const normalizeName = (value: string) => value.toLowerCase().replace(/[\s_\-./:#()（）・]+/g, "")

/** 標準の部位キーごとの CAD 名称（IFC クラス名・英語・日本語）。名前からの自動対応付けに使う */
export const ZONE_KEYWORDS: Record<string, string[]> = {
  pile: ["pile", "杭"],
  foundation: ["footing", "foundation", "基礎"],
  frame: ["column", "beam", "member", "frame", "鉄骨", "柱", "梁"],
  slab: ["slab", "floor", "deck", "床"],
  scaffold: ["scaffold", "足場"],
  envelope: ["curtainwall", "facade", "cladding", "外装", "外壁"],
  roof: ["roof", "屋上", "屋根"],
  mep: ["flowsegment", "duct", "pipe", "mep", "設備"],
  interior: ["interior", "partition", "内装"],
  exterior: ["hardscape", "landscape", "exterior", "外構"],
  [CAD_TERRAIN]: ["terrain", "topography", "ground", "地盤", "地形"],
}

/**
 * 名前から作業（部位キー）を推定する。親が対応付いたノードの子は親に任せる（階層の上で 1 回だけ決める）。
 * 既に extras/命名規約で部位が分かるノードは対象外（そのまま使う）。
 */
export function suggestCadRules(nodes: CadNode[], zones: Array<{ zone: string; label: string }>): Record<string, CadRule> {
  const rules: Record<string, CadRule> = {}
  const candidates = [
    ...zones.map(({ zone, label }) => ({ zone, words: [zone, label, ...(ZONE_KEYWORDS[zone] ?? [])] })),
    { zone: CAD_TERRAIN, words: ZONE_KEYWORDS[CAD_TERRAIN] },
  ].map(({ zone, words }) => ({ zone, words: words.map(normalizeName).filter((word) => word.length >= (/^[a-z0-9]+$/.test(word) ? 3 : 1)) }))
  for (const node of nodes) {
    if (node.presetZone || node.ancestors.some((name) => rules[name])) continue
    const name = normalizeName(node.name)
    const hit = candidates.find(({ words }) => words.some((word) => name.includes(word)))
    if (hit) rules[node.name] = { zone: hit.zone, grow: "y", kind: "build" }
  }
  return rules
}

const MAX_SEGMENTS = 60

function axisValue(box: Box3, grow: GrowAxis): number {
  const axis = grow.replace("-", "") as "x" | "y" | "z"
  const value = box.getCenter(new Vector3())[axis]
  return grow.startsWith("-") ? -value : value
}

/**
 * ノード名 → 作業の割り当てを配下のメッシュに書き込む。
 * 同じ作業に割り当てたノードが複数ある（階ごとのグループ。GLB では同名ノードに _1, _2 が付く）場合はそれぞれを、
 * 1 つしか無い場合は直下の子を施工単位とし、下から順（同じ高さなら施工方向の順）に segment を振る。
 * 進捗に応じて下の階・手前から順に出来上がる。
 */
export function applyCadRules(root: Object3D, rules: Record<string, CadRule>, zones: Array<{ zone: string; label: string }>): { assignedMeshes: number; zones: string[]; units: Record<string, string[]> } {
  root.updateMatrixWorld(true)
  const labels = new Map(zones.map((item) => [item.zone, item.label]))
  const ownerOf = new Map<Mesh, Object3D>()
  const byZone = new Map<string, Object3D[]>()
  const walk = (object: Object3D, owner: Object3D | undefined) => {
    const rule = rules[object.name.trim()]
    const next = rule?.zone ? object : owner
    if (next === object && rule) byZone.set(rule.zone, [...(byZone.get(rule.zone) ?? []), object])
    if (object instanceof Mesh && next) ownerOf.set(object, next)
    object.children.forEach((child) => walk(child, next))
  }
  walk(root, undefined)

  const assigned = new Set<string>()
  const unitNames: Record<string, string[]> = {}
  for (const [zone, owners] of byZone) {
    // 施工単位: 複数のノードならそれぞれ、1 つならメッシュを含む直下の子
    let units: Array<{ unit: Object3D; owner: Object3D }> = owners.map((owner) => ({ unit: owner, owner }))
    if (owners.length === 1) {
      const owner = owners[0]
      const children = owner.children.filter((child) => {
        let found = false
        child.traverse((item) => { if (item instanceof Mesh && ownerOf.get(item) === owner) found = true })
        return found
      })
      if (children.length > 1) units = children.map((unit) => ({ unit, owner }))
    }
    const grow = (owner: Object3D) => rules[owner.name.trim()].grow ?? "y"
    const ordered = units
      .map((item) => ({ ...item, box: new Box3().setFromObject(item.unit) }))
      .sort((a, b) => Math.round(a.box.min.y * 2) - Math.round(b.box.min.y * 2) || axisValue(a.box, grow(a.owner)) - axisValue(b.box, grow(b.owner)))
    const count = Math.min(ordered.length, MAX_SEGMENTS)
    const label = labels.get(zone) ?? zone
    if (zone !== CAD_TERRAIN) {
      // 施工単位の名前（下から順）。Copilot Studio が「3 階まで完了」などの報告を進捗率に換算するために使う
      const names: string[] = Array.from({ length: count }, () => "")
      ordered.forEach(({ unit }, index) => {
        const segmentIndex = Math.floor((index * count) / ordered.length)
        if (!names[segmentIndex]) names[segmentIndex] = unit.name || `${label} ${segmentIndex + 1}`
      })
      unitNames[zone] = names
    }
    ordered.forEach(({ unit, owner }, index) => {
      const rule = rules[owner.name.trim()]
      const segmentIndex = Math.floor((index * count) / ordered.length)
      unit.traverse((object) => {
        if (!(object instanceof Mesh) || ownerOf.get(object) !== owner) return
        const data = object.userData as Partial<ZoneInfo> & { context?: boolean; terrain?: boolean }
        delete data.context
        if (zone === CAD_TERRAIN) {
          delete data.zone
          data.terrain = true
          return
        }
        delete data.terrain
        delete data.segment
        delete data.invert
        delete data.temporary
        const info: ZoneInfo = { zone, label: count > 1 ? `${label} ${segmentIndex + 1}/${count}` : label, grow: rule.grow ?? "y" }
        if (count > 1) info.segment = [segmentIndex, count]
        if (rule.kind === "remove") info.invert = true
        if (rule.kind === "temporary") info.temporary = true
        Object.assign(data, info)
        assigned.add(zone)
      })
    })
  }
  let assignedMeshes = 0
  root.traverse((object) => { if (object instanceof Mesh && (object.userData as { zone?: string }).zone) assignedMeshes++ })
  return { assignedMeshes, zones: [...assigned], units: unitNames }
}
