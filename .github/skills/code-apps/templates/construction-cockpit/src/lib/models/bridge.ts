// 3 径間連続鋼 I 桁橋（下部工を施工中）。単位はメートル。橋軸方向が x、河川は z 方向に流れる。
import { Group, type BufferGeometry } from "three"
import {
  box, beam, context, crawlerCrane, cyl, dumpTruck, extrude, fenceLine, hSection, lampPost, noise, polygon,
  roundedSlot, segmentInfo, siteOffice, terrain, tree, worker, zoneParts, type ConstructionModel, type MaterialKey, type Vec3,
} from "./kit.ts"

const DECK_TOP = 13.33
const BEARING = 11.0
const GROUND = 2.0
const BED = -2.5
const WATER = -0.3
const SUPPORTS = { A1: -30, P1: -10, P2: 10, A2: 30 } as const

function baseGround(x: number, z: number): number {
  const ax = Math.abs(x)
  if (ax < 13) return BED + noise(x, z, 3) * 0.15
  if (ax < 19) return BED + ((ax - 13) / 6) * (GROUND - BED)
  return GROUND + noise(x, z, 5) * 0.35
}

/** 取付盛土（天端幅 14 m、のり勾配 1:1.5）を加えた地形 */
function ground(x: number, z: number): number {
  const base = baseGround(x, z)
  const ax = Math.abs(x)
  if (ax < 31.5) return base
  const top = DECK_TOP - 0.3 - Math.max(0, ax - 34) * ((DECK_TOP - GROUND) / 30)
  const embankment = top - Math.max(0, Math.abs(z) - 7) / 1.5
  return Math.max(base, embankment)
}

/** x 方向に傾いた版（取付道路の舗装など） */
function sloped(x0: number, y0: number, x1: number, y1: number, width: number, thickness: number, z = 0): BufferGeometry {
  const length = Math.hypot(x1 - x0, y1 - y0)
  return box(length, thickness, width).rotateZ(Math.atan2(y1 - y0, x1 - x0)).translate((x0 + x1) / 2, (y0 + y1) / 2, z)
}

function pier(group: Group, name: "P1" | "P2") {
  const x = SUPPORTS[name]
  const pilesX = [-2.2, 0, 2.2]
  const pilesZ = [-4.2, -1.4, 1.4, 4.2]
  const piles = pilesX.flatMap((dx) => pilesZ.map((dz) => cyl(0.5, 11.5, [x + dx, -10.25, dz], "y", 18)))
  for (let i = 0; i < 6; i += 1) {
    zoneParts(group, segmentInfo(`${name}-pile`, `${name} 鋼管杭`, i, 6, { grow: "y" }), [["steel", piles.slice(i * 2, i * 2 + 2)]])
  }
  zoneParts(group, { zone: `${name}-footing`, label: `${name} フーチング`, grow: "y" }, [
    ["concrete", [box(7, 2.5, 11, [x, -3.25, 0])]],
  ])
  const lift = 2.7
  for (let i = 0; i < 4; i += 1) {
    zoneParts(group, segmentInfo(`${name}-column`, `${name} 柱`, i, 5, { grow: "y" }), [
      ["concrete", [extrude(roundedSlot(2.4, 7.0), lift, "y", [x, -2.0 + lift * (i + 0.5), 0], 24)]],
    ])
  }
  const cap = polygon([[-3.6, 8.8], [3.6, 8.8], [6.1, 9.9], [6.1, 10.7], [-6.1, 10.7], [-6.1, 9.9]])
  const bearings = [-4.8, -2.4, 0, 2.4, 4.8].flatMap((z) => [box(0.9, 0.3, 0.7, [x - 0.6, 10.85, z]), box(0.9, 0.3, 0.7, [x + 0.6, 10.85, z])])
  zoneParts(group, segmentInfo(`${name}-column`, `${name} 張出し梁`, 4, 5, { grow: "y" }), [
    ["concrete", [extrude(cap, 2.6, "x", [x, 0, 0])]],
    ["steelDark", bearings],
  ])
}

function abutment(group: Group, name: "A1" | "A2") {
  const side = name === "A1" ? -1 : 1
  const at = SUPPORTS[name]
  const back = at + side * 1.5
  const pileGeometries = [at - side * 2, at + side * 2].flatMap((x) => [-4.5, -1.5, 1.5, 4.5].map((z) => cyl(0.6, 14, [x + side * 1, -7, z], "y", 18)))
  const wing = (z: number) => {
    // 負のスケールで反転すると面の向きが裏返るため、断面の座標で左右を作り分ける
    const shape = polygon([[0, GROUND], [side * 7, GROUND], [side * 7, 8.6], [0, DECK_TOP]])
    return extrude(shape, 0.6, "z", [back + side * 0.2, 0, z])
  }
  const layers: Array<[string, Array<[MaterialKey, BufferGeometry[]]>]> = [
    ["フーチング", [["concrete", [box(6, 2, 13.5, [at + side * 0.5, 1, 0])]]]],
    ["竪壁（下）", [["concrete", [box(2, 4.5, 12.6, [back - side * 0.5, GROUND + 2.25, 0])]]]],
    ["竪壁（上）・沓座", [["concrete", [box(2, 4.5, 12.6, [back - side * 0.5, GROUND + 6.75, 0]), box(1.2, 0.4, 12.6, [at - side * 0.2, BEARING - 0.2, 0])]], ["steelDark", [-4.8, -2.4, 0, 2.4, 4.8].map((z) => box(0.9, 0.3, 0.7, [at - side * 0.4, BEARING - 0.15, z]))]]],
    ["胸壁・翼壁", [["concrete", [box(0.6, DECK_TOP - BEARING, 12.6, [back + side * 0.2, (BEARING + DECK_TOP) / 2, 0]), wing(6.6), wing(-6.6)]]]],
  ]
  if (name === "A1") {
    for (let i = 0; i < 4; i += 1) zoneParts(group, segmentInfo("A1-pile", "A1 場所打ち杭", i, 4, { grow: "y" }), [["concreteDark", pileGeometries.slice(i * 2, i * 2 + 2)]])
    layers.forEach(([label, parts], i) => zoneParts(group, segmentInfo("A1-body", `A1 ${label}`, i, 4, { grow: "y" }), parts))
  } else {
    zoneParts(group, segmentInfo("A2-body", "A2 場所打ち杭", 0, 5, { grow: "y" }), [["concreteDark", pileGeometries]])
    layers.forEach(([label, parts], i) => zoneParts(group, segmentInfo("A2-body", `A2 ${label}`, i + 1, 5, { grow: "y" }), parts))
  }
}

function superstructure(group: Group) {
  const spans: Array<[number, number]> = [[-29.6, -10.1], [-9.9, 9.9], [10.1, 29.6]]
  const girderZ = [-4.8, -2.4, 0, 2.4, 4.8]
  spans.forEach(([x0, x1], index) => {
    const length = x1 - x0
    const cx = (x0 + x1) / 2
    const steel: BufferGeometry[] = girderZ.map((z) => extrude(hSection(2.0, 0.5, 0.07, 0.06), length, "x", [cx, BEARING + 1.0, z]))
    for (let x = x0 + 2.5; x < x1 - 1; x += 5) {
      for (let g = 0; g < girderZ.length - 1; g += 1) {
        steel.push(beam([x, BEARING + 0.2, girderZ[g]], [x, BEARING + 1.8, girderZ[g + 1]], 0.12), beam([x, BEARING + 1.8, girderZ[g]], [x, BEARING + 0.2, girderZ[g + 1]], 0.12))
      }
    }
    const concrete = [box(length, 0.25, 12.4, [cx, BEARING + 2.125, 0]), box(length, 1.0, 0.45, [cx, DECK_TOP + 0.42, 5.98]), box(length, 1.0, 0.45, [cx, DECK_TOP + 0.42, -5.98])]
    const railing: BufferGeometry[] = []
    for (const z of [5.98, -5.98]) {
      railing.push(box(length, 0.08, 0.08, [cx, DECK_TOP + 1.42, z]), box(length, 0.06, 0.06, [cx, DECK_TOP + 1.12, z]))
      for (let x = x0 + 1; x < x1; x += 2) railing.push(cyl(0.04, 0.5, [x, DECK_TOP + 1.17, z], "y", 8))
    }
    for (let x = x0 + 5; x < x1; x += 10) {
      railing.push(cyl(0.12, 9, [x, DECK_TOP + 5.4, -6.1], "y", 10, 0.08), beam([x, DECK_TOP + 9.8, -6.1], [x, DECK_TOP + 10.2, -4.4], 0.1))
    }
    const markings: BufferGeometry[] = [box(length, 0.012, 0.15, [cx, DECK_TOP + 0.006, 4.9]), box(length, 0.012, 0.15, [cx, DECK_TOP + 0.006, -4.9])]
    for (let x = x0 + 1; x < x1 - 4; x += 8) markings.push(box(5, 0.012, 0.15, [x + 2.5, DECK_TOP + 0.006, 0]))
    zoneParts(group, segmentInfo("superstructure", "上部工（別途工事）", index, 3, { grow: "x" }), [
      ["girder", steel],
      ["concrete", concrete],
      ["asphalt", [box(length, 0.08, 11.5, [cx, BEARING + 2.29, 0])]],
      ["white", markings],
      ["steel", railing],
      ["steelDark", [box(0.4, 0.05, 11.5, [x0 + 0.2, DECK_TOP + 0.01, 0])]],
    ])
  })
}

function revetment(group: Group) {
  const angle = Math.atan((GROUND - BED) / 6)
  for (const [sideIndex, side] of [-1, 1].entries()) {
    for (let k = 0; k < 3; k += 1) {
      const z0 = -30 + k * 20
      const blocks: BufferGeometry[] = []
      for (let row = 0; row < 5; row += 1) {
        const t = (row + 0.5) / 5
        const x = 13 + t * 6
        const y = BED + t * (GROUND - BED)
        for (let col = 0; col < 10; col += 1) {
          const offset = row % 2 ? 1 : 0
          const geometry = box(1.42, 0.35, 1.9).rotateZ(side * angle)
          blocks.push(geometry.translate(side * x - side * 0.1, y + 0.18, z0 + 1 + col * 2 + offset * 0.5 - 0.25))
        }
      }
      const toe = box(1.6, 0.8, 20, [side * 12.4, BED + 0.4, z0 + 10])
      zoneParts(group, segmentInfo("river", "護岸ブロック", sideIndex * 3 + k, 6, { grow: "z" }), [["precast", blocks], ["concreteDark", [toe]]])
    }
  }
}

function jetty(group: Group) {
  for (let i = 0; i < 5; i += 1) {
    const x0 = -14 + i * 5.6
    const steel: BufferGeometry[] = []
    for (const x of [x0 + 0.6, x0 + 5.0]) {
      for (const z of [11.3, 14.7]) steel.push(cyl(0.3, 6.5, [x, -1.25, z], "y", 12))
      steel.push(extrude(hSection(0.5, 0.3, 0.03, 0.03), 4.0, "z", [x, 1.75, 13]))
    }
    for (const z of [11.6, 14.4]) steel.push(extrude(hSection(0.7, 0.3, 0.03, 0.03), 5.6, "x", [x0 + 2.8, 2.35, z]))
    const deck = [box(5.55, 0.2, 4.2, [x0 + 2.8, 2.8, 13])]
    const rails = [14.95, 11.05].flatMap((z) => [box(5.6, 0.06, 0.06, [x0 + 2.8, 3.9, z]), ...[0.4, 2.8, 5.2].map((dx) => cyl(0.04, 1.1, [x0 + dx, 3.45, z], "y", 6))])
    zoneParts(group, segmentInfo("site", "仮設桟橋", i, 5, { grow: "x", temporary: true }), [["steel", steel], ["steelDark", deck], ["yellow", rails]])
  }
}

export function buildBridge(): ConstructionModel {
  const group = new Group()
  group.name = "bridge-3span"
  group.add(terrain(150, 90, 0, 0, ground, 1.5))
  context(group, "water", [box(31.9, 0.05, 90, [0, WATER, 0])], "river-water")

  const roads: BufferGeometry[] = []
  const curbs: BufferGeometry[] = []
  for (const side of [-1, 1]) {
    roads.push(sloped(side * 31.6, DECK_TOP - 0.05, side * 34, DECK_TOP - 0.05, 11.5, 0.1), sloped(side * 34, DECK_TOP - 0.05, side * 64, GROUND + 0.1, 11.5, 0.1))
    for (const z of [6.4, -6.4]) curbs.push(sloped(side * 31.6, DECK_TOP + 0.2, side * 34, DECK_TOP + 0.2, 0.3, 0.45, z), sloped(side * 34, DECK_TOP + 0.2, side * 64, GROUND + 0.35, 0.3, 0.45, z))
  }
  context(group, "asphaltOld", roads, "approach-road")
  context(group, "concreteDark", curbs, "approach-curb")
  context(group, "fence", [...fenceLine([-60, GROUND, -30], [-22, GROUND, -30]), ...fenceLine([22, GROUND, -30], [60, GROUND, -30])], "site-fence")

  pier(group, "P1")
  pier(group, "P2")
  abutment(group, "A1")
  abutment(group, "A2")
  superstructure(group)
  revetment(group)
  jetty(group)

  group.add(crawlerCrane([-6, 2.9, 13], Math.PI / 2 + 0.25, 24, 1.1, 9))
  group.add(siteOffice([-46, GROUND, -36], 0.1, 2))
  group.add(siteOffice([-38, GROUND, -36], 0.1, 1))
  group.add(dumpTruck([-40, GROUND, -27], 0.2))
  ;([[-10, -2.0, 2], [-9, -2.0, -2], [10.5, -2.0, 1], [-3, 2.9, 12.6], [0, 2.9, 13.5], [-30, 2.0, 3], [-29, 2.0, -2]] as Vec3[]).forEach((at, i) => group.add(worker(at, i * 1.3, i % 3 === 0 ? "yellow" : "vest")))
  ;([[-50, 20], [-44, 26], [-56, 14], [46, 24], [54, 18], [40, 30], [-24, 34], [26, -36], [-58, -12], [58, -20]] as Array<[number, number]>).forEach(([x, z], i) => group.add(tree([x, ground(x, z), z], 0.9 + (i % 3) * 0.2)))
  group.add(lampPost([-58, GROUND + 0.4, 7.5], Math.PI / 2))
  return { title: "3 径間連続鋼 I 桁橋（下部工）", root: group, camera: [62, 34, 70], target: [0, 4, 0] }
}
