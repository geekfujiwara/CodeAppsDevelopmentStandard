// 3D 施工モデルの共通部品。
// Node（GLB 書き出し）とブラウザの両方で動くよう、three 以外に依存せず、相対 import は拡張子付きで書く。
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  type Material,
} from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

export type Vec3 = [number, number, number]
export type Axis = "x" | "y" | "z"
/** 施工が進む方向。トンネル掘進のように奥（負方向）へ進む場合は "-z" などを使う */
export type GrowAxis = Axis | "-x" | "-y" | "-z"

/** メッシュの userData に入れる部位情報。glTF では extras として保存される */
export type ZoneInfo = {
  zone: string
  label: string
  segment?: [number, number]
  grow?: GrowAxis
  /** 切土・床掘など、進むほど取り除かれる部位 */
  invert?: boolean
  /** 足場・仮締切など完成形に含めない仮設物 */
  temporary?: boolean
}

export type ConstructionModel = {
  title: string
  root: Group
  camera: Vec3
  target: Vec3
}

// ---------------------------------------------------------------------------
// 材質
// ---------------------------------------------------------------------------
type Finish = { color: string; roughness?: number; metalness?: number; opacity?: number; vertexColors?: boolean }

export const PALETTE = {
  concrete: { color: "#c9c5bc", roughness: 0.92 },
  concreteDark: { color: "#a39e94", roughness: 0.95 },
  concreteFresh: { color: "#dcd8cf", roughness: 0.85 },
  precast: { color: "#bdb8ae", roughness: 0.9 },
  girder: { color: "#5f7f98", roughness: 0.45, metalness: 0.55 },
  steel: { color: "#6b7280", roughness: 0.4, metalness: 0.65 },
  steelDark: { color: "#3f4650", roughness: 0.45, metalness: 0.6 },
  rebar: { color: "#8b5a2b", roughness: 0.6, metalness: 0.4 },
  asphalt: { color: "#2b2d31", roughness: 0.95 },
  asphaltOld: { color: "#4a4c50", roughness: 0.98 },
  asphaltFresh: { color: "#141518", roughness: 0.6, metalness: 0.1 },
  gravel: { color: "#9b948a", roughness: 1 },
  gravelDark: { color: "#7d776e", roughness: 1 },
  soil: { color: "#8a6a45", roughness: 1 },
  soilDark: { color: "#6b4f33", roughness: 1 },
  soilCut: { color: "#b08a5c", roughness: 1 },
  grass: { color: "#5c7d3a", roughness: 1 },
  terrain: { color: "#ffffff", roughness: 1, vertexColors: true },
  water: { color: "#2f6f8f", roughness: 0.15, metalness: 0.1, opacity: 0.82 },
  glass: { color: "#8fc3dc", roughness: 0.08, metalness: 0.35, opacity: 0.5 },
  white: { color: "#f2f2f2", roughness: 0.6 },
  yellow: { color: "#e8b021", roughness: 0.5, metalness: 0.2 },
  orange: { color: "#ef6c1a", roughness: 0.6 },
  red: { color: "#c43b30", roughness: 0.5, metalness: 0.2 },
  blue: { color: "#2563eb", roughness: 0.5, metalness: 0.2 },
  green: { color: "#3f8f4f", roughness: 0.8 },
  meshSheet: { color: "#3f8f4f", roughness: 0.9, opacity: 0.55 },
  scaffold: { color: "#a3abb5", roughness: 0.4, metalness: 0.6 },
  plank: { color: "#b78a52", roughness: 0.9 },
  black: { color: "#1f2328", roughness: 0.7 },
  rubber: { color: "#18191b", roughness: 0.9 },
  skin: { color: "#e8b996", roughness: 0.8 },
  navy: { color: "#1e3a8a", roughness: 0.8 },
  vest: { color: "#f97316", roughness: 0.7 },
  helmet: { color: "#f8fafc", roughness: 0.4 },
  leaf: { color: "#3f6b2a", roughness: 1 },
  bark: { color: "#5b4129", roughness: 1 },
  light: { color: "#fff7cc", roughness: 0.3 },
  duct: { color: "#cfd6dd", roughness: 0.35, metalness: 0.7 },
  pipeRed: { color: "#b83a2e", roughness: 0.5, metalness: 0.3 },
  pipeBlue: { color: "#2f6fb0", roughness: 0.5, metalness: 0.3 },
  partition: { color: "#efece6", roughness: 0.9 },
  waterproof: { color: "#3d4a5a", roughness: 0.7 },
  sandbag: { color: "#4b4d45", roughness: 1 },
  fence: { color: "#f1f5f9", roughness: 0.7 },
} satisfies Record<string, Finish>

export type MaterialKey = keyof typeof PALETTE

const materials = new Map<MaterialKey, MeshStandardMaterial>()

export function material(key: MaterialKey): MeshStandardMaterial {
  const cached = materials.get(key)
  if (cached) return cached
  const finish: Finish = PALETTE[key]
  const result = new MeshStandardMaterial({
    name: key,
    color: finish.color,
    roughness: finish.roughness ?? 0.8,
    metalness: finish.metalness ?? 0,
    transparent: finish.opacity !== undefined,
    opacity: finish.opacity ?? 1,
    depthWrite: finish.opacity === undefined,
    vertexColors: finish.vertexColors ?? false,
  })
  materials.set(key, result)
  return result
}

export function isSharedMaterial(item: Material): boolean {
  return materials.get(item.name as MaterialKey) === item
}

// ---------------------------------------------------------------------------
// 形状
// ---------------------------------------------------------------------------
export function box(w: number, h: number, d: number, at: Vec3 = [0, 0, 0], rotY = 0): BufferGeometry {
  const geometry = new BoxGeometry(w, h, d)
  if (rotY) geometry.rotateY(rotY)
  return geometry.translate(...at)
}

/** 2 点を結ぶ角材（部材・手すり・ブレース） */
export function beam(from: Vec3, to: Vec3, size = 0.15): BufferGeometry {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const length = Math.max(0.001, Math.hypot(dx, dy, dz))
  const geometry = new BoxGeometry(size, length, size)
  geometry.rotateZ(-Math.atan2(Math.hypot(dx, dz), dy))
  geometry.rotateY(Math.atan2(-dz, dx))
  return geometry.translate((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2)
}

export function cyl(radius: number, height: number, at: Vec3 = [0, 0, 0], axis: Axis = "y", segments = 16, radiusTop = radius): BufferGeometry {
  const geometry = new CylinderGeometry(radiusTop, radius, height, segments)
  if (axis === "x") geometry.rotateZ(Math.PI / 2)
  if (axis === "z") geometry.rotateX(Math.PI / 2)
  return geometry.translate(...at)
}

export function sphere(radius: number, at: Vec3, scale: Vec3 = [1, 1, 1], segments = 12): BufferGeometry {
  return new SphereGeometry(radius, segments, Math.max(6, segments / 2)).scale(...scale).translate(...at)
}

/** shape を depth だけ押し出す。axis は押し出し方向（中心は at） */
export function extrude(shape: Shape, depth: number, axis: Axis, at: Vec3 = [0, 0, 0], curveSegments = 12): BufferGeometry {
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })
  geometry.translate(0, 0, -depth / 2)
  if (axis === "x") geometry.rotateY(Math.PI / 2)
  if (axis === "y") geometry.rotateX(-Math.PI / 2)
  return geometry.translate(...at)
}

export function polygon(points: Array<[number, number]>, holes: Array<Array<[number, number]>> = []): Shape {
  const shape = new Shape()
  points.forEach(([x, y], index) => (index ? shape.lineTo(x, y) : shape.moveTo(x, y)))
  shape.closePath()
  for (const hole of holes) {
    const path = new Path()
    hole.forEach(([x, y], index) => (index ? path.lineTo(x, y) : path.moveTo(x, y)))
    path.closePath()
    shape.holes.push(path)
  }
  return shape
}

/** 小判形（橋脚の断面など）。w が短辺、d が長辺 */
export function roundedSlot(w: number, d: number): Shape {
  const r = w / 2
  const half = d / 2 - r
  const shape = new Shape()
  shape.moveTo(-r, -half)
  shape.lineTo(-r, half)
  shape.absarc(0, half, r, Math.PI, 0, true)
  shape.lineTo(r, -half)
  shape.absarc(0, -half, r, 0, Math.PI, true)
  return shape
}

/** H 形鋼・I 桁の断面（高さ h、フランジ幅 b） */
export function hSection(h: number, b: number, tw: number, tf: number): Shape {
  const x = b / 2
  const y = h / 2
  const w = tw / 2
  return polygon([[-x, -y], [x, -y], [x, -y + tf], [w, -y + tf], [w, y - tf], [x, y - tf], [x, y], [-x, y], [-x, y - tf], [-w, y - tf], [-w, -y + tf], [-x, -y + tf]])
}

/** 円環の一部（トンネルの支保・覆工）。角度は x 軸から反時計回り */
export function annulusSector(inner: number, outer: number, start: number, end: number, cx = 0, cy = 0): Shape {
  const shape = new Shape()
  shape.moveTo(cx + Math.cos(start) * outer, cy + Math.sin(start) * outer)
  shape.absarc(cx, cy, outer, start, end, false)
  shape.lineTo(cx + Math.cos(end) * inner, cy + Math.sin(end) * inner)
  shape.absarc(cx, cy, inner, end, start, true)
  shape.closePath()
  return shape
}

function ensureUv(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  if (!flat.getAttribute("uv")) {
    flat.setAttribute("uv", new Float32BufferAttribute(new Float32Array(flat.getAttribute("position").count * 2), 2))
  }
  if (!flat.getAttribute("normal")) flat.computeVertexNormals()
  for (const name of Object.keys(flat.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) flat.deleteAttribute(name)
  }
  return flat
}

export function merge(geometries: BufferGeometry[]): BufferGeometry {
  const prepared = geometries.map(ensureUv)
  const hasColor = prepared.every((geometry) => geometry.getAttribute("color"))
  if (!hasColor) prepared.forEach((geometry) => { if (geometry.getAttribute("color")) geometry.deleteAttribute("color") })
  const merged = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false)
  if (!merged) throw new Error("ジオメトリを結合できません")
  return merged
}

// ---------------------------------------------------------------------------
// メッシュとグループ
// ---------------------------------------------------------------------------
export function part(geometries: BufferGeometry | BufferGeometry[], key: MaterialKey, info?: ZoneInfo, name?: string): Mesh {
  const geometry = Array.isArray(geometries) ? merge(geometries) : geometries
  const result = new Mesh(geometry, material(key))
  result.castShadow = true
  result.receiveShadow = true
  if (info) {
    result.userData = { ...info }
    result.name = name ?? (info.segment ? `${info.zone}#${info.segment[0] + 1}/${info.segment[1]}` : info.zone)
  } else {
    result.userData = { context: true }
    result.name = name ?? `context-${key}`
  }
  return result
}

/** 1 つの部位を複数のメッシュ（材質違い）で構成する */
export function zoneParts(group: Group, info: ZoneInfo, layers: Array<[MaterialKey, BufferGeometry[]]>): void {
  for (const [key, geometries] of layers) {
    if (geometries.length) group.add(part(geometries, key, info))
  }
}

export function context(group: Group, key: MaterialKey, geometries: BufferGeometry[], name?: string): Mesh {
  const result = part(geometries, key, undefined, name)
  group.add(result)
  return result
}

export function segmentInfo(zone: string, label: string, index: number, count: number, extra: Partial<ZoneInfo> = {}): ZoneInfo {
  return { zone, label: `${label} ${index + 1}/${count}`, segment: [index, count], ...extra }
}

// ---------------------------------------------------------------------------
// 地形
// ---------------------------------------------------------------------------
export function noise(x: number, z: number, seed = 1): number {
  return (
    Math.sin(x * 0.11 + seed) * Math.cos(z * 0.13 - seed * 0.7) * 0.6 +
    Math.sin(x * 0.27 + z * 0.19 + seed * 1.3) * 0.25 +
    Math.cos(x * 0.53 - z * 0.41 + seed * 2.1) * 0.12
  )
}

export type TerrainColor = (x: number, y: number, z: number, slope: number) => [number, number, number]

export const defaultTerrainColor: TerrainColor = (_x, y, _z, slope) => {
  if (slope > 0.55) return [0.55, 0.42, 0.28]
  if (y < -0.5) return [0.47, 0.42, 0.36]
  return slope > 0.3 ? [0.42, 0.5, 0.26] : [0.36, 0.49, 0.23]
}

/** 高さ関数から地形メッシュを作る（頂点色で草地・法面・河床を塗り分ける） */
export function terrain(width: number, depth: number, cx: number, cz: number, height: (x: number, z: number) => number, resolution = 1.5, color: TerrainColor = defaultTerrainColor): Mesh {
  const nx = Math.max(2, Math.round(width / resolution))
  const nz = Math.max(2, Math.round(depth / resolution))
  const geometry = new PlaneGeometry(width, depth, nx, nz)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(cx, 0, cz)
  const position = geometry.getAttribute("position")
  for (let i = 0; i < position.count; i += 1) position.setY(i, height(position.getX(i), position.getZ(i)))
  geometry.computeVertexNormals()
  const normal = geometry.getAttribute("normal")
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i += 1) {
    const slope = 1 - Math.abs(normal.getY(i))
    const [r, g, b] = color(position.getX(i), position.getY(i), position.getZ(i), slope)
    const jitter = 0.94 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.08
    colors.set([r * jitter, g * jitter, b * jitter], i * 3)
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3))
  const result = new Mesh(geometry, material("terrain"))
  result.receiveShadow = true
  result.name = "terrain"
  result.userData = { context: true, terrain: true }
  return result
}

/** 上面が高さ関数、下面が平らな閉じた土塊（切土・床掘の部位に使う） */
export function terrainBlock(x0: number, x1: number, z0: number, z1: number, base: number, height: (x: number, z: number) => number, steps = 6): BufferGeometry {
  const positions: number[] = []
  const top = (i: number, j: number): Vec3 => {
    const x = x0 + ((x1 - x0) * i) / steps
    const z = z0 + ((z1 - z0) * j) / steps
    return [x, Math.max(base + 0.05, height(x, z)), z]
  }
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => positions.push(...a, ...b, ...c, ...a, ...c, ...d)
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) quad(top(i, j), top(i, j + 1), top(i + 1, j + 1), top(i + 1, j))
  }
  for (let k = 0; k < steps; k += 1) {
    const sides: Array<[Vec3, Vec3]> = [
      [top(k, 0), top(k + 1, 0)], [top(steps, k), top(steps, k + 1)],
      [top(k + 1, steps), top(k, steps)], [top(0, k + 1), top(0, k)],
    ]
    for (const [a, b] of sides) quad(a, b, [b[0], base, b[2]], [a[0], base, a[2]])
  }
  quad([x0, base, z0], [x1, base, z0], [x1, base, z1], [x0, base, z1])
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

// ---------------------------------------------------------------------------
// 重機・作業員・付属物（すべて文脈メッシュ）
// ---------------------------------------------------------------------------
function assemble(parts: Array<[MaterialKey, BufferGeometry[]]>, at: Vec3, rotY: number, scale = 1, name = "equipment"): Group {
  const group = new Group()
  group.name = name
  for (const [key, geometries] of parts) {
    if (geometries.length) group.add(part(geometries, key, undefined, `${name}-${key}`))
  }
  group.scale.setScalar(scale)
  group.rotation.y = rotY
  group.position.set(...at)
  group.userData = { context: true }
  return group
}

function wheels(xs: number[], zs: number[], radius: number, width: number, y = radius): BufferGeometry[] {
  return xs.flatMap((x) => zs.map((z) => cyl(radius, width, [x, y, z], "z", 18)))
}

export function worker(at: Vec3, rotY = 0, vest: MaterialKey = "vest"): Group {
  return assemble([
    ["navy", [new CapsuleGeometry(0.13, 0.75, 2, 6).translate(-0.12, 0.5, 0), new CapsuleGeometry(0.13, 0.75, 2, 6).translate(0.12, 0.5, 0)]],
    [vest, [new CapsuleGeometry(0.26, 0.45, 2, 8).translate(0, 1.25, 0), new CapsuleGeometry(0.09, 0.5, 2, 6).rotateZ(0.25).translate(-0.36, 1.2, 0), new CapsuleGeometry(0.09, 0.5, 2, 6).rotateZ(-0.25).translate(0.36, 1.2, 0)]],
    ["skin", [sphere(0.15, [0, 1.75, 0], [1, 1, 1], 8)]],
    ["helmet", [sphere(0.18, [0, 1.82, 0], [1, 0.7, 1], 8), cyl(0.21, 0.03, [0, 1.79, 0], "y", 10)]],
  ], at, rotY, 1, "worker")
}

export function excavator(at: Vec3, rotY = 0, reach = 0.5): Group {
  const boomEnd: Vec3 = [3.6, 3.6 + reach * 0.8, 0]
  const armEnd: Vec3 = [5.4 + reach, 0.9 + reach * 0.4, 0]
  return assemble([
    ["rubber", [box(4.2, 0.85, 0.7, [0, 0.42, -1.15]), box(4.2, 0.85, 0.7, [0, 0.42, 1.15])]],
    ["steelDark", [...wheels([-1.6, -0.8, 0, 0.8, 1.6], [-1.15, 1.15], 0.33, 0.72, 0.42), box(2.4, 0.4, 1.8, [0, 0.95, 0])]],
    ["yellow", [box(3.0, 1.1, 2.4, [-0.2, 1.7, 0]), box(1.0, 0.8, 2.2, [-1.6, 2.45, 0]), beam([0.8, 2.0, 0.35], boomEnd, 0.45), beam(boomEnd, armEnd, 0.35)]],
    ["black", [box(1.1, 1.3, 0.95, [0.75, 2.85, 0.7])]],
    ["glass", [box(0.95, 0.85, 0.9, [0.8, 2.95, 0.7])]],
    ["steel", [box(0.9, 0.75, 1.1, [armEnd[0] + 0.25, armEnd[1] - 0.45, 0])]],
  ], at, rotY, 1, "excavator")
}

export function dumpTruck(at: Vec3, rotY = 0, load: MaterialKey = "soil"): Group {
  return assemble([
    ["rubber", wheels([-2.2, -0.9, 2.2], [-1.05, 1.05], 0.55, 0.45, 0.55)],
    ["steelDark", [box(6.4, 0.35, 1.8, [0, 0.95, 0])]],
    ["blue", [box(1.6, 1.9, 2.3, [2.5, 2.0, 0])]],
    ["glass", [box(0.1, 0.8, 2.0, [3.31, 2.45, 0])]],
    ["steel", [box(4.4, 1.3, 2.4, [-0.9, 1.9, 0])]],
    [load, [box(4.2, 0.4, 2.2, [-0.9, 2.62, 0])]],
  ], at, rotY, 1, "dump-truck")
}

export function bulldozer(at: Vec3, rotY = 0): Group {
  return assemble([
    ["rubber", [box(3.6, 0.9, 0.6, [0, 0.45, -1.1]), box(3.6, 0.9, 0.6, [0, 0.45, 1.1])]],
    ["yellow", [box(2.8, 1.2, 2.0, [-0.2, 1.45, 0]), box(1.4, 1.2, 1.6, [-0.9, 2.6, 0])]],
    ["glass", [box(1.2, 0.8, 1.5, [-0.85, 2.75, 0])]],
    ["steel", [box(0.25, 1.3, 3.2, [2.2, 0.75, 0]), beam([1.2, 1.2, 0.8], [2.1, 0.8, 0.8], 0.15), beam([1.2, 1.2, -0.8], [2.1, 0.8, -0.8], 0.15)]],
  ], at, rotY, 1, "bulldozer")
}

export function roller(at: Vec3, rotY = 0): Group {
  return assemble([
    ["steel", [cyl(0.7, 1.9, [-1.4, 0.7, 0], "z", 24), cyl(0.7, 1.9, [1.4, 0.7, 0], "z", 24)]],
    ["yellow", [box(3.2, 0.9, 1.7, [0, 1.55, 0]), box(0.15, 1.4, 0.15, [0.6, 2.7, 0.7]), box(0.15, 1.4, 0.15, [0.6, 2.7, -0.7]), box(1.4, 0.1, 1.6, [0.1, 3.4, 0])]],
    ["black", [box(0.8, 0.5, 0.6, [0.2, 2.25, 0])]],
  ], at, rotY, 1, "roller")
}

export function asphaltFinisher(at: Vec3, rotY = 0): Group {
  return assemble([
    ["rubber", [box(3.0, 0.7, 0.6, [0, 0.35, -1.2]), box(3.0, 0.7, 0.6, [0, 0.35, 1.2])]],
    ["yellow", [box(3.2, 1.3, 3.0, [0, 1.35, 0]), box(1.3, 1.0, 3.2, [1.7, 1.6, 0])]],
    ["steelDark", [box(1.0, 0.5, 4.6, [-2.0, 0.35, 0])]],
    ["black", [box(1.2, 0.15, 2.2, [-0.4, 3.0, 0]), box(0.1, 1.0, 0.1, [-0.9, 2.5, 1]), box(0.1, 1.0, 0.1, [-0.9, 2.5, -1])]],
  ], at, rotY, 1, "asphalt-finisher")
}

/** クローラクレーン（ラチスブーム）。angle はブームの仰角 */
export function crawlerCrane(at: Vec3, rotY = 0, boom = 26, angle = 1.05, hook = 10): Group {
  const base: Vec3 = [1.2, 3.0, 0]
  const tip: Vec3 = [base[0] + Math.cos(angle) * boom, base[1] + Math.sin(angle) * boom, 0]
  const chords: BufferGeometry[] = []
  const lacing: BufferGeometry[] = []
  const offsets: Array<[number, number]> = [[0.55, 0.55], [0.55, -0.55], [-0.55, 0.55], [-0.55, -0.55]]
  const normal = [-Math.sin(angle), Math.cos(angle)]
  const point = (t: number, u: number, w: number): Vec3 => [
    base[0] + (tip[0] - base[0]) * t + normal[0] * u * (1 - t * 0.6),
    base[1] + (tip[1] - base[1]) * t + normal[1] * u * (1 - t * 0.6),
    w * (1 - t * 0.6),
  ]
  for (const [u, w] of offsets) chords.push(beam(point(0, u, w), point(1, u, w), 0.14))
  const panels = 14
  for (let i = 0; i < panels; i += 1) {
    const t0 = i / panels
    const t1 = (i + 1) / panels
    lacing.push(beam(point(t0, 0.55, 0.55), point(t1, -0.55, 0.55), 0.07), beam(point(t0, 0.55, -0.55), point(t1, -0.55, -0.55), 0.07))
    lacing.push(beam(point(t0, 0.55, 0.55), point(t1, 0.55, -0.55), 0.07), beam(point(t0, -0.55, 0.55), point(t1, -0.55, -0.55), 0.07))
  }
  return assemble([
    ["rubber", [box(6.2, 1.1, 1.0, [0, 0.55, -1.9]), box(6.2, 1.1, 1.0, [0, 0.55, 1.9])]],
    ["steelDark", [box(3.0, 0.6, 3.0, [0, 1.3, 0]), box(1.5, 1.5, 3.6, [-3.0, 2.4, 0])]],
    ["red", [box(4.6, 1.8, 3.0, [-0.6, 2.5, 0]), ...chords, ...lacing]],
    ["glass", [box(1.2, 1.3, 1.0, [1.1, 2.9, 1.3])]],
    ["black", [beam([tip[0], tip[1], 0], [tip[0], tip[1] - hook, 0], 0.04), box(0.5, 0.7, 0.4, [tip[0], tip[1] - hook - 0.35, 0])]],
  ], at, rotY, 1, "crawler-crane")
}

/** タワークレーン（ラチスマスト・ジブ） */
export function towerCrane(at: Vec3, rotY = 0, height = 50, jib = 40): Group {
  const mast: BufferGeometry[] = []
  const s = 1.0
  for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]] as Array<[number, number]>) mast.push(box(0.18, height, 0.18, [x, height / 2, z]))
  for (let y = 0; y < height; y += 2.4) {
    mast.push(beam([-s, y, -s], [s, y + 2.4, -s], 0.08), beam([s, y, s], [-s, y + 2.4, s], 0.08), beam([-s, y, s], [-s, y + 2.4, -s], 0.08), beam([s, y, -s], [s, y + 2.4, s], 0.08))
  }
  const jibParts: BufferGeometry[] = [
    beam([0, height + 0.5, -0.6], [-jib, height + 0.5, -0.6], 0.16), beam([0, height + 0.5, 0.6], [-jib, height + 0.5, 0.6], 0.16),
    beam([0, height + 2.2, 0], [-jib, height + 1.0, 0], 0.16), beam([0, height + 0.5, 0], [jib * 0.35, height + 0.5, 0], 0.5),
  ]
  for (let x = 0; x < jib; x += 2.5) jibParts.push(beam([-x, height + 0.5, -0.6], [-x - 2.5, height + 2.2 - (x / jib) * 1.2, 0], 0.07), beam([-x, height + 0.5, 0.6], [-x - 2.5, height + 2.2 - (x / jib) * 1.2, 0], 0.07))
  return assemble([
    ["yellow", [...mast, ...jibParts, box(2.6, 2.4, 2.6, [0, height + 1.4, 0]), box(3, 0.6, 3, [0, height + 0.2, 0])]],
    ["concreteDark", [box(4.5, 1.6, 2.4, [jib * 0.3, height + 1.5, 0]), box(6, 1.5, 6, [0, 0.75, 0])]],
    ["glass", [box(1.6, 1.4, 1.6, [-1.2, height + 2.0, 1.4])]],
    ["black", [beam([-jib * 0.6, height + 0.4, 0], [-jib * 0.6, height * 0.45, 0], 0.05)]],
  ], at, rotY, 1, "tower-crane")
}

export function siteOffice(at: Vec3, rotY = 0, stacks = 2): Group {
  const units: BufferGeometry[] = []
  const windows: BufferGeometry[] = []
  for (let i = 0; i < stacks; i += 1) {
    units.push(box(6.0, 2.6, 2.4, [0, 1.3 + i * 2.65, 0]))
    for (const x of [-1.8, 0, 1.8]) windows.push(box(1.0, 0.9, 0.05, [x, 1.5 + i * 2.65, 1.22]))
  }
  return assemble([
    ["fence", units],
    ["blue", Array.from({ length: stacks }, (_, i) => box(6.05, 0.25, 2.45, [0, 2.5 + i * 2.65, 0]))],
    ["glass", windows],
    ["steelDark", stacks > 1 ? [box(0.9, 0.12, 2.6, [3.6, 2.65, 0]), ...Array.from({ length: 8 }, (_, i) => box(0.9, 0.08, 0.3, [3.6, 0.3 + i * 0.3, -1.2 + i * 0.3]))] : []],
  ], at, rotY, 1, "site-office")
}

export function cone(at: Vec3): Group {
  return assemble([
    ["orange", [cyl(0.2, 0.7, [0, 0.38, 0], "y", 14, 0.04)]],
    ["white", [cyl(0.15, 0.12, [0, 0.45, 0], "y", 14, 0.11)]],
    ["black", [box(0.45, 0.04, 0.45, [0, 0.02, 0])]],
  ], at, 0, 1, "cone")
}

export function tree(at: Vec3, size = 1): Group {
  return assemble([
    ["bark", [cyl(0.18 * size, 2.2 * size, [0, 1.1 * size, 0], "y", 8)]],
    ["leaf", [sphere(1.4 * size, [0, 3.0 * size, 0], [1, 1.15, 1], 10), sphere(1.0 * size, [0.6 * size, 3.8 * size, 0.3 * size], [1, 1, 1], 8)]],
  ], at, 0, 1, "tree")
}

export function car(at: Vec3, rotY = 0, color: MaterialKey = "white"): Group {
  return assemble([
    ["rubber", wheels([-1.3, 1.3], [-0.8, 0.8], 0.33, 0.25, 0.33)],
    [color, [box(4.3, 0.75, 1.75, [0, 0.75, 0]), box(2.4, 0.7, 1.6, [-0.2, 1.45, 0])]],
    ["glass", [box(2.3, 0.55, 1.62, [-0.2, 1.48, 0])]],
  ], at, rotY, 1, "car")
}

/** 仮囲いパネル（白・下端は青） */
export function fenceLine(from: Vec3, to: Vec3): BufferGeometry[] {
  const length = Math.hypot(to[0] - from[0], to[2] - from[2])
  const panels = Math.max(1, Math.round(length / 3))
  const angle = Math.atan2(-(to[2] - from[2]), to[0] - from[0])
  return Array.from({ length: panels }, (_, i) => {
    const t = (i + 0.5) / panels
    return box(2.95, 2.0, 0.08, [from[0] + (to[0] - from[0]) * t, from[1] + 1.0, from[2] + (to[2] - from[2]) * t], angle)
  })
}

export function lampPost(at: Vec3, rotY = 0, height = 9): Group {
  return assemble([
    ["steel", [cyl(0.1, height, [0, height / 2, 0], "y", 10, 0.07), beam([0, height, 0], [1.6, height + 0.4, 0], 0.08)]],
    ["light", [box(0.7, 0.18, 0.3, [1.8, height + 0.35, 0])]],
  ], at, rotY, 1, "lamp-post")
}

export function disposeModel(root: Group): void {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose()
      const list: Material[] = Array.isArray(object.material) ? object.material : [object.material]
      list.forEach((item) => { if (!isSharedMaterial(item)) item.dispose() })
    }
  })
}
