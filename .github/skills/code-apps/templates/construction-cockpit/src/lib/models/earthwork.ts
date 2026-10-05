// 宅地造成（切土で上段宅盤、盛土で下段宅盤を造り、境に L 型擁壁）。単位はメートル。
import { Group, Vector3, type BufferGeometry } from "three"
import {
  beam, box, bulldozer, context, dumpTruck, excavator, extrude, fenceLine, noise, polygon, roller, segmentInfo,
  siteOffice, terrain, terrainBlock, tree, worker, zoneParts, type ConstructionModel, type Vec3,
} from "./kit.ts"

const UPPER = 6
const LOWER = 0
const VALLEY = -3
const WALL_X = -3.4

function hill(x: number, z: number): number {
  const rise = Math.min(1, Math.max(0, (-x - 4) / 34))
  return UPPER + 2.2 + rise * 6 + noise(x, z, 7) * 1.4
}

const FILL_X0 = WALL_X + 0.45
const FILL_X1 = 38.5
const FILL_Z = 28.5

/** 工事完了後に残る地盤（切土後の上段・盛土前の谷・周辺の自然地形） */
function ground(x: number, z: number): number {
  const az = Math.abs(z)
  if (x < -44) return 13 + noise(x, z, 2) * 1.2 + Math.min(4, (-44 - x) * 0.3)
  if (x < -40) return UPPER + ((-40 - x) / 4) * 7
  if (x < WALL_X) return az > 30 ? UPPER + (az - 30) * 1.5 : UPPER
  const distance = Math.hypot(Math.max(0, x - FILL_X1), Math.max(0, az - FILL_Z))
  if (distance === 0) return VALLEY
  return Math.min(LOWER + noise(x, z, 4) * 0.4, VALLEY + distance * 1.6)
}

function uDitch(length: number, at: Vec3): BufferGeometry {
  return extrude(polygon([[-0.35, 0], [0.35, 0], [0.35, 0.6], [0.25, 0.6], [0.25, 0.1], [-0.25, 0.1], [-0.25, 0.6], [-0.35, 0.6]]), length, "x", at)
}

export function buildEarthwork(): ConstructionModel {
  const group = new Group()
  group.name = "earthwork-terrace"
  group.add(terrain(110, 84, -2, 0, ground, 1.2))

  // 切土（上段宅盤の上に残る土塊。進むほど削られて消える）
  for (const [zone, label, z0, z1] of [["cut-1", "第1工区 切土", -28, -2], ["cut-2", "第2工区 切土", 2, 28]] as Array<[string, string, number, number]>) {
    for (let i = 0; i < 6; i += 1) {
      const xi = i % 3
      const zi = Math.floor(i / 3)
      const x0 = -39 + xi * 11.6
      const zMid = (z0 + z1) / 2
      const za = zi === 0 ? z0 : zMid
      const zb = zi === 0 ? zMid : z1
      zoneParts(group, segmentInfo(zone, label, i, 6, { grow: "y", invert: true }), [["soil", [terrainBlock(x0, x0 + 11.6, za, zb, UPPER, hill, 6)]]])
    }
  }

  // 盛土（30cm 仕上がりの層を 5 層、のり勾配 1:1.5 で積む）
  for (const [zone, label, z0, z1] of [["fill-1", "第1工区 盛土", -FILL_Z, 0], ["fill-2", "第2工区 盛土", 0, FILL_Z]] as Array<[string, string, number, number]>) {
    for (let i = 0; i < 5; i += 1) {
      const thickness = (LOWER - VALLEY) / 5
      const inset = i * thickness * 1.5
      const outer = z0 === 0 ? [z0, z1 - inset] : [z0 + inset, z1]
      const geometry = box(FILL_X1 - FILL_X0 - inset, thickness, outer[1] - outer[0], [(FILL_X0 + FILL_X1 - inset) / 2, VALLEY + thickness * (i + 0.5), (outer[0] + outer[1]) / 2])
      zoneParts(group, segmentInfo(zone, `${label} 第${i + 1}層`, i, 5, { grow: "x" }), [[i % 2 ? "soil" : "soilDark", [geometry]]])
    }
  }

  // L 型擁壁（高さ 6.2 m、延長 56 m を 8 ブロック）
  for (let i = 0; i < 8; i += 1) {
    const z = -28 + 3.5 + i * 7
    const stem = box(0.45, UPPER + 0.4, 6.95, [WALL_X + 0.22, (UPPER + 0.4) / 2, z])
    const heel = box(3.6, 0.6, 6.95, [WALL_X - 1.6, -0.3, z])
    const coping = box(0.7, 0.25, 6.95, [WALL_X + 0.22, UPPER + 0.5, z])
    const weep = [1.2, 2.6, 4.0].flatMap((y) => [-2, 0, 2].map((dz) => box(0.5, 0.12, 0.12, [WALL_X + 0.5, y, z + dz])))
    zoneParts(group, segmentInfo("retaining", "L型擁壁", i, 8, { grow: "y" }), [["precast", [stem, heel, coping]], ["black", weep]])
  }

  // 切土法面の保護（法枠＋植生基材）。法尻 (-40, 6) から法肩 (-44, 13) へ上る面
  const slopeLength = Math.hypot(4, 7)
  const normal: [number, number] = [7 / slopeLength, 4 / slopeLength]
  for (let i = 0; i < 6; i += 1) {
    const z0 = -28 + i * (56 / 6)
    const z1 = z0 + 56 / 6
    const frames: BufferGeometry[] = []
    const point = (t: number, z: number): Vec3 => [-40 - 4 * t + normal[0] * 0.18, UPPER + 7 * t + normal[1] * 0.18, z]
    for (let t = 0; t <= 1.001; t += 1 / 3) frames.push(beam(point(t, z0), point(t, z1), 0.32))
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 3) frames.push(beam(point(0, z), point(1, z), 0.32))
    const vegetation = box(slopeLength, 0.08, z1 - z0).rotateZ(Math.atan2(7, -4)).translate(-42 + normal[0] * 0.06, UPPER + 3.5 + normal[1] * 0.06, (z0 + z1) / 2)
    zoneParts(group, segmentInfo("slope", "法面保護（法枠・植生）", i, 6, { grow: "y" }), [["concrete", frames], ["grass", [vegetation]]])
  }

  // 区画道路（車道 6 m、歩道・縁石・区画線）
  const roadSegments: Array<{ from: number; to: number; level: number; axis: "x" | "z"; at: number }> = [
    { from: -1, to: 19, level: LOWER, axis: "x", at: 0 },
    { from: 19, to: 40, level: LOWER, axis: "x", at: 0 },
    { from: -39, to: -22, level: UPPER, axis: "x", at: 0 },
    { from: -22, to: -5, level: UPPER, axis: "x", at: 0 },
    { from: -28, to: -4, level: LOWER, axis: "z", at: 20 },
    { from: 4, to: 28, level: LOWER, axis: "z", at: 20 },
  ]
  roadSegments.forEach(({ from, to, level, axis, at }, index) => {
    const length = to - from
    const mid = (from + to) / 2
    const place = (along: number, across: number, w: number, h: number, l: number, y: number) =>
      axis === "x" ? box(l, h, w, [along, y, at + across]) : box(w, h, l, [at + across, y, along])
    zoneParts(group, segmentInfo("road", "区画道路", index, 6, { grow: axis }), [
      ["asphalt", [place(mid, 0, 6, 0.12, length, level + 0.06)]],
      ["concreteDark", [place(mid, 3.15, 0.3, 0.3, length, level + 0.15), place(mid, -3.15, 0.3, 0.3, length, level + 0.15)]],
      ["concrete", [place(mid, 4.3, 2, 0.2, length, level + 0.1), place(mid, -4.3, 2, 0.2, length, level + 0.1)]],
      ["white", Array.from({ length: Math.floor(length / 6) }, (_, k) => place(from + 1.5 + k * 6 + 1.5, 0, 0.15, 0.02, 3, level + 0.125))],
    ])
  })

  // 雨水排水（U 型側溝・集水桝）
  for (let i = 0; i < 8; i += 1) {
    const side = i < 4 ? 1 : -1
    const k = i % 4
    const x0 = -1 + k * 10.25
    zoneParts(group, segmentInfo("drain", "U型側溝・集水桝", i, 8, { grow: "x" }), [
      ["precast", [uDitch(10.2, [x0 + 5.125, LOWER - 0.45, side * 5.6])]],
      ["concreteDark", [box(1.0, 0.9, 1.0, [x0 + 10, LOWER - 0.4, side * 5.6])]],
      ["steelDark", [box(0.8, 0.05, 0.8, [x0 + 10, LOWER + 0.06, side * 5.6])]],
    ])
  }

  // 仮囲い（完成形には含めない）
  const corners: Vec3[] = [[-46, 0, -33], [46, 0, -33], [46, 0, 33], [-46, 0, 33]]
  for (let i = 0; i < 8; i += 1) {
    const a = corners[Math.floor(i / 2)]
    const b = corners[(Math.floor(i / 2) + 1) % 4]
    const t0 = (i % 2) / 2
    const t1 = t0 + 0.5
    const from: Vec3 = [a[0] + (b[0] - a[0]) * t0, 0, a[2] + (b[2] - a[2]) * t0]
    const to: Vec3 = [a[0] + (b[0] - a[0]) * t1, 0, a[2] + (b[2] - a[2]) * t1]
    const panels = fenceLine(from, to).map((geometry) => {
      geometry.computeBoundingBox()
      const center = geometry.boundingBox!.getCenter(new Vector3())
      return geometry.translate(0, Math.max(LOWER, ground(center.x, center.z)), 0)
    })
    zoneParts(group, segmentInfo("site", "仮囲い", i, 8, { grow: "x", temporary: true }), [["fence", panels]])
  }

  context(group, "water", [box(8, 0.05, 6, [42, -1.2, 26])], "sediment-pond")
  context(group, "concreteDark", [box(8.6, 1.4, 0.3, [42, -0.6, 22.85]), box(8.6, 1.4, 0.3, [42, -0.6, 29.15]), box(0.3, 1.4, 6.6, [37.85, -0.6, 26]), box(0.3, 1.4, 6.6, [46.15, -0.6, 26])], "sediment-pond-wall")
  group.add(excavator([-18, hill(-18, -14) + 0.2, -14], 0.4, 0.8))
  group.add(excavator([-30, hill(-30, 16) + 0.2, 16], 2.6, 0.3))
  group.add(dumpTruck([-8, UPPER, -0.5], Math.PI))
  group.add(dumpTruck([10, LOWER, 10], 0.3))
  group.add(bulldozer([24, LOWER, -14], 0.5))
  group.add(roller([14, LOWER, 18], -0.2))
  group.add(siteOffice([40, LOWER, -38], 0, 2))
  ;([[-1, -10], [4, 12], [10, -16], [22, 14], [30, 6], [30, -8]] as Array<[number, number]>).forEach(([x, z], i) => group.add(worker([x, LOWER, z], i)))
  ;([[50, -20], [52, 10], [-50, -36], [-52, 30], [30, 40], [-10, 40], [10, -42]] as Array<[number, number]>).forEach(([x, z], i) => group.add(tree([x, ground(x, z), z], 1 + (i % 2) * 0.2)))
  return { title: "宅地造成（切盛土・擁壁・区画道路）", root: group, camera: [62, 46, 66], target: [-2, 2, 0] }
}
