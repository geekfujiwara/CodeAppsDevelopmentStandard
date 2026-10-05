// 水路改修（プレキャスト U 型水路）と河川護岸。水路は x 方向に延長 60 m、河川は +z 側。単位はメートル。
import { Group, type BufferGeometry } from "three"
import {
  box, context, crawlerCrane, cyl, dumpTruck, excavator, extrude, noise, polygon, segmentInfo, siteOffice, sphere, terrain,
  tree, worker, zoneParts, type ConstructionModel,
} from "./kit.ts"

const LENGTH = 60
const SEGMENTS = 10
const STEP = LENGTH / SEGMENTS
const TRENCH_BOTTOM = -2.6
const BANK_TOP_Z = 4.5
const BED = -3.2

function ground(x: number, z: number): number {
  const az = Math.abs(z)
  if (z < BANK_TOP_Z) {
    if (az < 2.2) return TRENCH_BOTTOM
    if (az < 3.8 && z < 3.8) return TRENCH_BOTTOM + ((az - 2.2) / 1.6) * -TRENCH_BOTTOM
    return noise(x, z, 3) * 0.15
  }
  if (z < BANK_TOP_Z + 4.8) return ((z - BANK_TOP_Z) / 4.8) * BED
  if (z < 22) return BED + noise(x, z, 8) * 0.2
  if (z < 27) return BED + ((z - 22) / 5) * -BED
  return noise(x, z, 5) * 0.3
}

export function buildChannel(): ConstructionModel {
  const group = new Group()
  group.name = "channel-revetment"
  group.add(terrain(90, 64, 0, 4, ground, 0.5))

  const x = (i: number) => -LENGTH / 2 + STEP * (i + 0.5)
  const trench = polygon([[-3.8, 0], [3.8, 0], [2.2, TRENCH_BOTTOM], [-2.2, TRENCH_BOTTOM]])
  const flume = polygon([[-1.4, -2.3], [1.4, -2.3], [1.4, -0.1], [1.2, -0.1], [1.2, -2.1], [-1.2, -2.1], [-1.2, -0.1], [-1.4, -0.1]])
  const wedge = (side: number) => polygon([[side * 1.42, -2.3], [side * 2.25, -2.3], [side * 3.8, -0.05], [side * 1.42, -0.05]])

  for (let i = 0; i < SEGMENTS; i += 1) {
    const cx = x(i)
    zoneParts(group, segmentInfo("excavation", "床掘", i, SEGMENTS, { grow: "y", invert: true }), [["soilDark", [extrude(trench, STEP - 0.02, "x", [cx, 0, 0])]]])
    zoneParts(group, segmentInfo("base", "基礎砕石・均しコンクリート", i, SEGMENTS, { grow: "x" }), [
      ["gravel", [box(STEP - 0.02, 0.2, 4.4, [cx, TRENCH_BOTTOM + 0.1, 0])]],
      ["concrete", [box(STEP - 0.02, 0.1, 3.2, [cx, TRENCH_BOTTOM + 0.25, 0])]],
    ])
    const units: BufferGeometry[] = []
    for (let k = 0; k < 3; k += 1) units.push(extrude(flume, 1.97, "x", [cx - STEP / 2 + 1 + k * 2, 0, 0]))
    zoneParts(group, segmentInfo("precast", "プレキャスト U 型水路", i, SEGMENTS, { grow: "x" }), [["precast", units]])
    zoneParts(group, segmentInfo("backfill", "埋戻し", i, SEGMENTS, { grow: "y" }), [["soil", [extrude(wedge(1), STEP - 0.02, "x", [cx, 0, 0]), extrude(wedge(-1), STEP - 0.02, "x", [cx, 0, 0])]]])
  }

  // 護岸（法勾配 1:1.6 のブロック張り・天端工・基礎工・根固め）
  const angle = Math.atan2(-BED, 4.8)
  for (let i = 0; i < 8; i += 1) {
    const x0 = -LENGTH / 2 + i * (LENGTH / 8)
    const blocks: BufferGeometry[] = []
    for (let row = 0; row < 4; row += 1) {
      const t = (row + 0.5) / 4
      const z = BANK_TOP_Z + t * 4.8
      const y = t * BED
      for (let col = 0; col < 5; col += 1) {
        blocks.push(box(1.45, 0.3, 1.38).rotateX(angle).translate(x0 + 0.75 + col * 1.5 + (row % 2) * 0.35 - 0.17, y + 0.2, z + 0.1))
      }
    }
    const toe = [0, 1, 2, 3].map((k) => cyl(0.55, 0.7, [x0 + 1 + k * 1.9, BED + 0.35, BANK_TOP_Z + 6], "y", 6))
    zoneParts(group, segmentInfo("revetment", "護岸ブロック", i, 8, { grow: "x" }), [
      ["precast", blocks],
      ["concrete", [box(LENGTH / 8, 0.5, 0.8, [x0 + LENGTH / 16, 0.0, BANK_TOP_Z - 0.2]), box(LENGTH / 8, 0.8, 1.0, [x0 + LENGTH / 16, BED + 0.2, BANK_TOP_Z + 5.0])]],
      ["concreteDark", toe],
    ])
  }

  // 管理用通路と防護柵
  for (let i = 0; i < 6; i += 1) {
    const cx = -LENGTH / 2 + 5 + i * 10
    const posts = [0, 2.5, 5, 7.5].map((k) => cyl(0.05, 1.1, [cx - 5 + k + 1.25, 0.55, -6.9], "y", 8))
    zoneParts(group, segmentInfo("pave", "管理用通路", i, 6, { grow: "x" }), [
      ["gravel", [box(9.98, 0.2, 3.4, [cx, 0.02, -5.3])]],
      ["asphalt", [box(9.98, 0.08, 3.0, [cx, 0.16, -5.3])]],
      ["white", [...posts, box(10, 0.08, 0.06, [cx, 1.0, -6.9]), box(10, 0.08, 0.06, [cx, 0.6, -6.9])]],
    ])
  }

  // 仮締切（大型土のう）
  for (let i = 0; i < 6; i += 1) {
    const cx = -LENGTH / 2 + 5 + i * 10
    const bags: BufferGeometry[] = []
    for (let k = 0; k < 9; k += 1) {
      bags.push(sphere(0.62, [cx - 4.4 + k * 1.1, BED + 0.55, 11.4], [1, 0.8, 1], 7), sphere(0.62, [cx - 3.85 + k * 1.1, BED + 1.45, 11.4], [1, 0.8, 1], 7))
    }
    zoneParts(group, segmentInfo("site", "仮締切（大型土のう）", i, 6, { grow: "x", temporary: true }), [["sandbag", bags]])
  }

  const waterMesh = context(group, "water", [box(LENGTH + 30, 0.05, 19.1, [0, -1.1, 15.7])], "river-water")
  waterMesh.receiveShadow = true

  group.add(excavator([8, 0, -9.5], -0.4, 0.9))
  group.add(crawlerCrane([-14, 0, -11], -Math.PI / 2 + 0.3, 20, 1.15, 8))
  group.add(dumpTruck([24, 0, -10], 0))
  group.add(siteOffice([-36, 0, -16], 0, 2))
  ;([[-6, -4.5], [-2, -4.2], [4, 3.6], [12, 3.8], [-18, 4.0]] as Array<[number, number]>).forEach(([wx, wz], i) => group.add(worker([wx, 0, wz], i)))
  ;([[-40, 32], [-28, 34], [-14, 33], [6, 34], [20, 32], [36, 33], [-44, -20], [40, -22]] as Array<[number, number]>).forEach(([tx, tz], i) => group.add(tree([tx, ground(tx, tz), tz], 0.9 + (i % 3) * 0.15)))
  return { title: "水路改修・護岸（プレキャスト U 型水路）", root: group, camera: [34, 22, 38], target: [0, -1, 3] }
}
