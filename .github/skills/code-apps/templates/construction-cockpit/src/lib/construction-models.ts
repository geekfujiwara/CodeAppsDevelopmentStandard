// 工事種別ごとの 3D 構造物を「部位（zone）」単位のパーツで組み立てる。
// 作業（${PUBLISHER_PREFIX}_task）の ${PUBLISHER_PREFIX}_zone と一致する部位が、その作業の進捗に応じて施工済・施工中・未着手で描画される。
// 外部アセット（glTF / HDR / フォント）を読み込まないため、Code Apps の CSP 下でも必ず表示できる。

export type Vec3 = [number, number, number]
export type PartShape = "box" | "cylinder" | "halfTube" | "frame" | "uchannel"

export type ModelPart = {
  id: string
  zone: string
  label: string
  shape: PartShape
  position: Vec3
  /** box/frame/uchannel: [幅, 高さ, 奥行] / cylinder: [半径, 高さ, 半径] / halfTube: [半径, 半径, 長さ] */
  size: Vec3
  color: string
  grow?: "x" | "y" | "z"
  /** 同じ部位を複数パーツで構成する場合の [順番, 総数]。進捗に応じて順に施工される */
  segment?: [number, number]
  /** 切土・床掘など、進むほど取り除かれる部位 */
  invert?: boolean
  doneColor?: string
  rotation?: Vec3
  /** ガラス・足場シートなど半透明の部位 */
  opacity?: number
}

export type ContextMesh = {
  id: string
  shape: "box" | "sphere" | "cylinder"
  position: Vec3
  size: Vec3
  color: string
  opacity?: number
  rotation?: Vec3
}

export type ModelProp = {
  id: string
  kind: "crawlerCrane" | "towerCrane" | "excavator" | "dumpTruck" | "office" | "paver"
  position: Vec3
  rotation?: number
  scale?: number
}

export type ConstructionScene = {
  title: string
  parts: ModelPart[]
  context: ContextMesh[]
  props: ModelProp[]
  camera: Vec3
  target: Vec3
  ground: { size: [number, number]; color: string; hidden?: boolean }
}

export const MODEL_TYPE_LABEL: Record<number, string> = {
  100000000: "橋梁",
  100000001: "造成",
  100000002: "トンネル",
  100000003: "建築",
  100000004: "水路・護岸",
  100000005: "道路",
}

const CONCRETE = "#d4d4d8"
const CONCRETE_DARK = "#a1a1aa"
const STEEL = "#64748b"
const SOIL = "#a16207"
const SOIL_DARK = "#78350f"
const ASPHALT = "#334155"

function segments(
  zone: string,
  label: string,
  count: number,
  build: (index: number) => Omit<ModelPart, "id" | "zone" | "label" | "segment">,
): ModelPart[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${zone}-${index}`,
    zone,
    label: `${label} ${index + 1}/${count}`,
    segment: [index, count] as [number, number],
    ...build(index),
  }))
}

function parseParams(value: string): Record<string, number> {
  return Object.fromEntries(
    value.split(";").map((pair) => pair.split("=")).filter(([key, raw]) => key && raw && !Number.isNaN(Number(raw)))
      .map(([key, raw]) => [key.trim(), Number(raw)]),
  )
}

function bridge(): ConstructionScene {
  const parts: ModelPart[] = [
    ...segments("site", "仮設桟橋", 5, (i) => ({ shape: "box", position: [-8 + i * 4, 0.6, 5.5], size: [3.8, 0.3, 2.2], color: STEEL, grow: "x" })),
    ...segments("A1-pile", "A1 場所打ち杭", 4, (i) => ({ shape: "cylinder", position: [-14 + (i % 2) * 2, 0.6, -2 + Math.floor(i / 2) * 4], size: [0.45, 1.2, 0.45], color: CONCRETE_DARK, grow: "y" })),
    ...segments("A1-body", "A1 橋台", 4, (i) => ({ shape: "box", position: [-13, 1.2 + i * 1.75 + 0.875, 0], size: i === 0 ? [4.5, 1.75, 9] : [2.4, 1.75, 9], color: CONCRETE, grow: "y" })),
    ...["P1", "P2"].flatMap((pier, p) => {
      const x = p === 0 ? -4 : 4
      return [
        ...segments(`${pier}-pile`, `${pier} 鋼管杭`, 6, (i) => ({ shape: "cylinder", position: [x - 1.2 + (i % 2) * 2.4, 0.6, -2.6 + Math.floor(i / 2) * 2.6], size: [0.35, 1.2, 0.35], color: STEEL, grow: "y" })),
        { id: `${pier}-footing`, zone: `${pier}-footing`, label: `${pier} フーチング`, shape: "box" as const, position: [x, 1.7, 0] as Vec3, size: [4.4, 1, 7.4] as Vec3, color: CONCRETE, grow: "y" as const },
        ...segments(`${pier}-column`, `${pier} 柱・梁`, 5, (i) => i < 4
          ? { shape: "box", position: [x, 2.2 + i * 1.6 + 0.8, 0], size: [2, 1.6, 3.2], color: CONCRETE, grow: "y" }
          : { shape: "box", position: [x, 9.0, 0], size: [3, 1.2, 9], color: CONCRETE, grow: "y" }),
      ]
    }),
    ...segments("A2-body", "A2 橋台", 5, (i) => i === 0
      ? { shape: "box", position: [13, 0.9, 0], size: [4.5, 1.2, 9], color: CONCRETE, grow: "y" }
      : { shape: "box", position: [13, 1.5 + (i - 1) * 1.75 + 0.875, 0], size: [2.4, 1.75, 9], color: CONCRETE, grow: "y" }),
    ...segments("river", "護岸復旧", 6, (i) => ({ shape: "box", position: [i < 3 ? -7.2 : 7.2, 0.25, -9 + (i % 3) * 6], size: [1.6, 0.5, 5.8], color: CONCRETE_DARK, grow: "z", rotation: [0, 0, i < 3 ? 0.35 : -0.35] })),
  ]
  return {
    title: "橋梁下部工",
    parts,
    context: [
      { id: "water", shape: "box", position: [0, 0.02, 0], size: [12, 0.12, 26], color: "#0e7490", opacity: 0.75 },
      { id: "deck", shape: "box", position: [0, 10.2, 0], size: [30, 0.8, 9.4], color: "#94a3b8", opacity: 0.12 },
    ],
    props: [
      { id: "crane", kind: "crawlerCrane", position: [-1, 0.3, -8], rotation: 0.6 },
      { id: "office", kind: "office", position: [-17, 0, 8] },
    ],
    camera: [20, 16, 24],
    target: [0, 3, 0],
    ground: { size: [44, 30], color: "#4d7c0f" },
  }
}

function earthwork(): ConstructionScene {
  const hill = (zone: string, label: string, x0: number, z0: number) =>
    segments(zone, label, 6, (i) => ({
      shape: "box", position: [x0 + (i % 3) * 3, 1.4, z0 + Math.floor(i / 3) * 3.4], size: [3, 2.8, 3.4],
      color: "#65a30d", doneColor: "#d6b48a", grow: "y", invert: true,
    }))
  const fill = (zone: string, label: string, x0: number, z0: number) =>
    segments(zone, label, 5, (i) => ({ shape: "box", position: [x0, 0.2 + i * 0.4, z0], size: [9, 0.4, 6.4], color: i % 2 ? SOIL : "#b45309", grow: "x" }))
  return {
    title: "宅地造成",
    parts: [
      ...segments("site", "仮囲い", 8, (i) => ({ shape: "box", position: [-15 + i * 4.2, 0.9, -11], size: [4, 1.8, 0.15], color: "#e2e8f0", grow: "x" })),
      ...hill("cut-1", "第1工区 切土", -13, -7),
      ...hill("cut-2", "第2工区 切土", -13, 1),
      ...fill("fill-1", "第1工区 盛土", 3, -5),
      ...fill("fill-2", "第2工区 盛土", 3, 3),
      ...segments("retaining", "L型擁壁", 8, (i) => ({ shape: "box", position: [8.2, 1.2, -8 + i * 2.2], size: [0.5, 2.4, 2.1], color: CONCRETE, grow: "y" })),
      ...segments("drain", "U型側溝", 8, (i) => ({ shape: "uchannel", position: [-14 + i * 3.6, 0.15, 8.6], size: [3.5, 0.4, 0.8], color: CONCRETE_DARK, grow: "x" })),
      ...segments("slope", "法面保護", 6, (i) => ({ shape: "box", position: [-4.2, 1.3, -8 + i * 3.1], size: [0.25, 2.8, 3], color: "#16a34a", grow: "y", rotation: [0, 0, 0.6] })),
      ...segments("road", "造成道路", 6, (i) => ({ shape: "box", position: [-12 + i * 4.8, 0.08, 10.4], size: [4.7, 0.16, 2.4], color: ASPHALT, grow: "x" })),
    ],
    context: [],
    props: [
      { id: "excavator", kind: "excavator", position: [-6, 0, -1], rotation: 2.4 },
      { id: "dump", kind: "dumpTruck", position: [-1, 0, 6], rotation: 1.4 },
      { id: "office", kind: "office", position: [14, 0, -10] },
    ],
    camera: [22, 18, 22],
    target: [-2, 1, 0],
    ground: { size: [40, 28], color: "#a3a3a3" },
  }
}

function tunnel(): ConstructionScene {
  const length = 30
  const count = 12
  const step = length / count
  const z = (i: number) => 14 - step / 2 - i * step
  return {
    title: "山岳トンネル",
    parts: [
      { id: "portal", zone: "portal", label: "坑口付け", shape: "box", position: [0, 0.25, 17], size: [10, 0.5, 5], color: "#57534e", grow: "z" },
      ...segments("upper", "上半掘削・支保", count, (i) => ({ shape: "halfTube", position: [0, 2.2, z(i)], size: [3, 3, step - 0.05], color: "#a8a29e", grow: "z" })),
      ...segments("lower", "下半掘削", count, (i) => ({ shape: "box", position: [0, 1.1, z(i)], size: [6, 2.2, step - 0.05], color: "#78716c", grow: "z" })),
      ...segments("invert", "インバート", count, (i) => ({ shape: "box", position: [0, 0.15, z(i)], size: [5.6, 0.3, step - 0.05], color: CONCRETE_DARK, grow: "z" })),
      ...segments("lining", "覆工コンクリート", count, (i) => ({ shape: "halfTube", position: [0, 2.2, z(i)], size: [2.7, 2.7, step - 0.1], color: "#e7e5e4", grow: "z" })),
      ...segments("equip", "設備・舗装", count, (i) => ({ shape: "box", position: [0, 0.35, z(i)], size: [4.6, 0.1, step - 0.05], color: ASPHALT, grow: "z" })),
      { id: "portal-finish", zone: "portal-finish", label: "坑門工", shape: "box", position: [0, 3.2, 14.4], size: [9.5, 6.4, 0.8], color: CONCRETE, grow: "y" },
    ],
    context: [
      { id: "mountain", shape: "sphere", position: [0, -2, -1], size: [16, 11, 17], color: "#4d7c0f", opacity: 0.28 },
    ],
    props: [
      { id: "office", kind: "office", position: [11, 0, 23] },
      { id: "dump", kind: "dumpTruck", position: [-8, 0, 22], rotation: 0.3 },
    ],
    camera: [22, 14, 28],
    target: [0, 2, 2],
    ground: { size: [44, 46], color: "#57534e" },
  }
}

function architecture(params: Record<string, number>): ConstructionScene {
  const floors = Math.min(14, Math.max(1, params.floors ?? 4))
  const bayX = Math.min(10, Math.max(2, params.width ?? 6))
  const bayZ = Math.min(8, Math.max(2, params.depth ?? 4))
  const unit = floors > 6 ? 2 : 2.6
  const width = bayX * unit
  const depth = bayZ * unit
  const height = floors > 6 ? 2.4 : 3
  const base = 1.4
  const pileCount = Math.min(24, (bayX + 1) * (bayZ + 1))
  const pileCols = bayX + 1
  const totalHeight = base + floors * height
  const extent = Math.max(totalHeight, width + 8, depth + 8)
  return {
    title: `建築（${floors} 階）`,
    parts: [
      ...segments("pile", "杭", pileCount, (i) => ({
        shape: "cylinder", position: [-width / 2 + (i % pileCols) * unit, 0.3, -depth / 2 + Math.floor(i / pileCols) * unit],
        size: [0.25, 0.6, 0.25], color: CONCRETE_DARK, grow: "y",
      })),
      { id: "foundation", zone: "foundation", label: "基礎躯体", shape: "box", position: [0, 1, 0], size: [width + 1, 0.8, depth + 1], color: CONCRETE, grow: "x" },
      ...segments("frame", "鉄骨建方", floors, (i) => ({ shape: "frame", position: [0, base + i * height + height / 2, 0], size: [width, height, depth], color: STEEL, grow: "y" })),
      ...segments("slab", "床スラブ", floors, (i) => ({ shape: "box", position: [0, base + (i + 1) * height - 0.1, 0], size: [width - 0.1, 0.2, depth - 0.1], color: CONCRETE, grow: "x" })),
      ...segments("scaffold", "外部足場", floors, (i) => ({ shape: "box", position: [0, base + i * height + height / 2, depth / 2 + 0.7], size: [width + 1.4, height, 0.3], color: "#22c55e", grow: "y", opacity: 0.45 })),
      ...segments("envelope", "外装", floors, (i) => ({ shape: "box", position: [0, base + i * height + height / 2, 0], size: [width + 0.2, height - 0.15, depth + 0.2], color: "#7dd3fc", grow: "y", opacity: 0.5 })),
      ...segments("mep", "設備", floors, (i) => ({ shape: "box", position: [0, base + (i + 1) * height - 0.5, 0], size: [width * 0.7, 0.3, 0.6], color: "#f97316", grow: "x" })),
      ...segments("interior", "内装", floors, (i) => ({ shape: "box", position: [0, base + i * height + height / 2 - 0.1, 0], size: [width * 0.8, height - 0.5, depth * 0.6], color: "#f5f5f4", grow: "x" })),
      { id: "roof", zone: "roof", label: "屋上防水", shape: "box", position: [0, base + floors * height + 0.15, 0], size: [width, 0.12, depth], color: "#475569", grow: "x" },
      ...segments("exterior", "外構舗装", 4, (i) => ({ shape: "box", position: i < 2 ? [0, 0.05, (i === 0 ? -1 : 1) * (depth / 2 + 3)] : [(i === 2 ? -1 : 1) * (width / 2 + 3), 0.05, 0], size: i < 2 ? [width + 8, 0.1, 3] : [3, 0.1, depth], color: ASPHALT, grow: i < 2 ? "x" : "z" })),
    ],
    context: [],
    props: [
      floors > 6
        ? { id: "crane", kind: "towerCrane", position: [width / 2 + 4, 0, -depth / 2 - 3], scale: (totalHeight + 8) / 24 }
        : { id: "crane", kind: "crawlerCrane", position: [width / 2 + 5, 0.3, -2], rotation: 2.6 },
      { id: "office", kind: "office", position: [-width / 2 - 6, 0, depth / 2 + 4] },
    ],
    camera: [extent * 1.0, totalHeight * 0.55 + extent * 0.6, extent * 1.2],
    target: [0, totalHeight / 2, 0],
    ground: { size: [width + 26, depth + 24], color: "#a3a3a3" },
  }
}

function channel(): ConstructionScene {
  const count = 10
  const x = (i: number) => -15 + 1.5 + i * 3
  return {
    title: "水路・護岸",
    parts: [
      ...segments("site", "仮締切（大型土のう）", 6, (i) => ({ shape: "box", position: [-15 + 2.5 + i * 5, 0.35, 5.6], size: [4.9, 0.7, 0.9], color: "#3f3f46", grow: "x" })),
      ...segments("excavation", "床掘", count, (i) => ({ shape: "box", position: [x(i), -0.75, 0], size: [3, 1.5, 3.2], color: SOIL_DARK, doneColor: "#57534e", grow: "y", invert: true })),
      ...segments("base", "基礎砕石", count, (i) => ({ shape: "box", position: [x(i), -1.4, 0], size: [2.95, 0.2, 2.6], color: CONCRETE_DARK, grow: "x" })),
      ...segments("precast", "プレキャスト水路", count, (i) => ({ shape: "uchannel", position: [x(i), -0.8, 0], size: [2.9, 1, 2], color: CONCRETE, grow: "x" })),
      ...segments("backfill", "埋戻し", count, (i) => ({ shape: "box", position: [x(i), -0.65, -1.35], size: [2.95, 1.3, 0.5], color: SOIL, grow: "y" })),
      ...segments("revetment", "護岸ブロック", 8, (i) => ({ shape: "box", position: [-13 + i * 3.7, 0.2, 2.9], size: [3.6, 0.35, 2.4], color: CONCRETE_DARK, grow: "x", rotation: [-0.45, 0, 0] })),
      ...segments("pave", "管理用通路", 6, (i) => ({ shape: "box", position: [-12.5 + i * 5, 0.06, -3.6], size: [4.9, 0.12, 2], color: ASPHALT, grow: "x" })),
    ],
    context: [
      // 溝を見せるため、地面を「溝の底」「背面側の地盤」「護岸側の地盤」に分けて置く
      { id: "trench-floor", shape: "box", position: [0, -1.6, 0], size: [32, 0.1, 3.4], color: "#57534e" },
      { id: "bank-back", shape: "box", position: [0, -0.8, -6.85], size: [32, 1.6, 10.3], color: "#65a30d" },
      { id: "bank-front", shape: "box", position: [0, -0.8, 3.65], size: [32, 1.6, 3.9], color: "#65a30d" },
      { id: "water", shape: "box", position: [0, -0.5, 8], size: [32, 0.2, 5], color: "#0e7490", opacity: 0.75 },
      { id: "riverbed", shape: "box", position: [0, -1.4, 8], size: [32, 0.2, 5], color: "#44403c" },
    ],
    props: [
      { id: "excavator", kind: "excavator", position: [6, 0, -6.5], rotation: 0.6 },
      { id: "crane", kind: "crawlerCrane", position: [-6, 0.3, -7.5], rotation: 1.2, scale: 0.7 },
    ],
    camera: [16, 13, 18],
    target: [0, -0.5, 0],
    ground: { size: [34, 22], color: "#65a30d", hidden: true },
  }
}

function road(): ConstructionScene {
  const count = 8
  const x = (i: number) => -18 + 2.25 + i * 4.5
  const layer = (zone: string, label: string, y: number, h: number, color: string, width = 8) =>
    segments(zone, label, count, (i) => ({ shape: "box", position: [x(i), y + h / 2, 0], size: [4.45, h, width], color, grow: "x" }))
  return {
    title: "道路舗装",
    parts: [
      ...segments("site", "交通規制", count, (i) => ({ shape: "box", position: [x(i), 0.4, 5.2], size: [4.2, 0.8, 0.25], color: "#f97316", grow: "x" })),
      ...layer("subgrade", "路床改良", 0, 0.5, "#a16207"),
      ...layer("subbase", "下層路盤", 0.5, 0.35, "#a8a29e"),
      ...layer("base", "上層路盤", 0.85, 0.25, "#78716c"),
      ...layer("binder", "基層", 1.1, 0.12, "#3f3f46"),
      ...layer("surface", "表層", 1.22, 0.1, "#18181b"),
      ...segments("marking", "区画線", count, (i) => ({ shape: "box", position: [x(i), 1.34, 0], size: [3.2, 0.03, 0.2], color: "#fafafa", grow: "x" })),
    ],
    context: [
      { id: "existing", shape: "box", position: [0, 0.6, -6.5], size: [36, 1.2, 5], color: "#52525b", opacity: 0.9 },
    ],
    props: [
      { id: "paver", kind: "paver", position: [4, 1.3, 1.5], rotation: 0 },
      { id: "dump", kind: "dumpTruck", position: [12, 1.3, 1.5], rotation: Math.PI },
    ],
    camera: [18, 12, 20],
    target: [0, 0.8, 0],
    ground: { size: [44, 24], color: "#65a30d" },
  }
}

function generic(zones: Array<{ zone: string; label: string }>): ConstructionScene {
  return {
    title: "工程モデル",
    parts: zones.slice(0, 16).map(({ zone, label }, index) => ({
      id: zone, zone, label, shape: "box", color: CONCRETE, grow: "y",
      position: [((index % 4) - 1.5) * 3, 1.5, (Math.floor(index / 4) - 1.5) * 3], size: [2.2, 3, 2.2],
    })),
    context: [],
    props: [],
    camera: [12, 12, 14],
    target: [0, 1, 0],
    ground: { size: [20, 20], color: "#a3a3a3" },
  }
}

export function buildConstructionScene(
  modelType: number,
  params: string,
  fallbackZones: Array<{ zone: string; label: string }>,
): ConstructionScene {
  switch (modelType) {
    case 100000000: return bridge()
    case 100000001: return earthwork()
    case 100000002: return tunnel()
    case 100000003: return architecture(parseParams(params))
    case 100000004: return channel()
    case 100000005: return road()
    default: return generic(fallbackZones)
  }
}
