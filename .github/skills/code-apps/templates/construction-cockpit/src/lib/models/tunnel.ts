// 2 車線の山岳トンネル（NATM）。坑口が z = +8、奥（-z 方向）へ延長 60 m 掘り進む。単位はメートル。
import { Group, type BufferGeometry } from "three"
import {
  annulusSector, box, cone, context, cyl, dumpTruck, excavator, extrude, noise, polygon, segmentInfo, siteOffice,
  sphere, terrain, tree, worker, zoneParts, type ConstructionModel, type Vec3,
} from "./kit.ts"

const PORTAL_Z = 8
const LENGTH = 60
const SEGMENTS = 12
const STEP = LENGTH / SEGMENTS
const SPRING = 2.8
const OUTER = 5.6

function mountain(x: number, z: number): number {
  if (z > PORTAL_Z + 2) return noise(x, z, 9) * 0.25
  const depth = PORTAL_Z + 2 - z
  const ridge = Math.min(30, depth * 0.95) + noise(x, z, 6) * 2.5 - Math.abs(x) * 0.18
  const portalCut = Math.abs(x) < 12 && z > PORTAL_Z - 6 ? Math.max(0, 8 - (PORTAL_Z + 2 - z) * 0.9) : 0
  return Math.max(0, ridge - portalCut)
}

/** トンネル内空の外形（上半の円弧＋側壁）。坑口の吹付け面や坑門の開口に使う */
function opening(radius: number): Array<[number, number]> {
  const points: Array<[number, number]> = [[radius, -0.6]]
  for (let i = 0; i <= 24; i += 1) {
    const a = (Math.PI * i) / 24
    points.push([Math.cos(a) * radius, SPRING + Math.sin(a) * radius])
  }
  points.push([-radius, -0.6])
  return points
}

export function buildTunnel(): ConstructionModel {
  const group = new Group()
  group.name = "tunnel-natm"
  group.add(terrain(120, 110, 0, -20, mountain, 1.5))

  for (let i = 0; i < SEGMENTS; i += 1) {
    const z = PORTAL_Z - STEP * (i + 0.5)
    const zEnd = PORTAL_Z - STEP * i
    // 上半掘削：吹付けコンクリート、鋼製支保工（1 m ピッチ）、ロックボルト
    const ribs: BufferGeometry[] = []
    const bolts: BufferGeometry[] = []
    for (let k = 0; k < 5; k += 1) {
      const rz = zEnd - 0.5 - k
      ribs.push(extrude(annulusSector(5.2, 5.42, -0.02, Math.PI + 0.02, 0, SPRING), 0.2, "z", [0, 0, rz], 10))
      if (k % 2 === 0) {
        for (const a of [0.45, 0.95, Math.PI / 2, Math.PI - 0.95, Math.PI - 0.45]) {
          const geometry = cyl(0.035, 3.0, [0, 0, 0], "y", 6)
          geometry.translate(0, OUTER + 1.5, 0).rotateZ(a - Math.PI / 2).translate(0, SPRING, rz)
          bolts.push(geometry)
        }
      }
    }
    zoneParts(group, segmentInfo("upper", "上半掘削・支保", i, SEGMENTS, { grow: "-z" }), [
      ["concreteDark", [extrude(annulusSector(5.3, OUTER, 0, Math.PI, 0, SPRING), STEP - 0.02, "z", [0, 0, z], 32)]],
      ["steel", [...ribs, ...bolts]],
    ])
    // 下半掘削：側壁の吹付けと支保の継ぎ足し
    zoneParts(group, segmentInfo("lower", "下半掘削", i, SEGMENTS, { grow: "-z" }), [
      ["concreteDark", [box(0.3, SPRING + 0.6, STEP - 0.02, [OUTER - 0.15, (SPRING - 0.6) / 2, z]), box(0.3, SPRING + 0.6, STEP - 0.02, [-OUTER + 0.15, (SPRING - 0.6) / 2, z])]],
      ["steel", Array.from({ length: 5 }, (_, k) => [box(0.2, SPRING + 0.6, 0.2, [5.31, (SPRING - 0.6) / 2, zEnd - 0.5 - k]), box(0.2, SPRING + 0.6, 0.2, [-5.31, (SPRING - 0.6) / 2, zEnd - 0.5 - k])]).flat()],
    ])
    // インバート（下に凸の曲面）と埋戻し
    zoneParts(group, segmentInfo("invert", "インバート", i, SEGMENTS, { grow: "-z" }), [
      ["concrete", [extrude(annulusSector(20.6, 21.2, Math.PI * 1.5 - 0.266, Math.PI * 1.5 + 0.266, 0, 20), STEP - 0.02, "z", [0, 0, z], 20)]],
      ["gravelDark", [box(10.4, 0.55, STEP - 0.02, [0, -0.62, z])]],
    ])
    // 覆工コンクリート（目地を見せるため 5 cm あける）
    zoneParts(group, segmentInfo("lining", "覆工コンクリート", i, SEGMENTS, { grow: "-z" }), [
      ["concreteFresh", [
        extrude(annulusSector(4.9, 5.28, 0, Math.PI, 0, SPRING), STEP - 0.05, "z", [0, 0, z], 36),
        box(0.38, SPRING + 0.35, STEP - 0.05, [5.09, (SPRING - 0.35) / 2, z]),
        box(0.38, SPRING + 0.35, STEP - 0.05, [-5.09, (SPRING - 0.35) / 2, z]),
      ]],
    ])
    // 舗装・監査路・照明・ジェットファン
    const fans = i % 4 === 1 ? [cyl(0.6, 4.2, [-1.6, 7.0, z], "z", 20), cyl(0.6, 4.2, [1.6, 7.0, z], "z", 20)] : []
    zoneParts(group, segmentInfo("equip", "舗装・設備", i, SEGMENTS, { grow: "-z" }), [
      ["asphalt", [box(7.2, 0.25, STEP, [0, -0.125, z])]],
      ["concrete", [box(1.1, 0.55, STEP, [4.1, 0.03, z]), box(1.1, 0.55, STEP, [-4.1, 0.03, z])]],
      ["white", [box(0.15, 0.01, 2.5, [0, 0.005, z]), box(0.15, 0.01, STEP, [3.4, 0.005, z]), box(0.15, 0.01, STEP, [-3.4, 0.005, z])]],
      ["light", [box(0.25, 0.25, 1.2, [4.75, 4.4, z]), box(0.25, 0.25, 1.2, [-4.75, 4.4, z])]],
      ["steel", fans],
    ])
  }

  // 坑口付け（坑口斜面の吹付けと仮設の門形鋼製支保）
  const face = polygon([[-13, -1.4], [13, -1.4], [13, 13], [-13, 13]], [opening(OUTER + 0.1).reverse()])
  zoneParts(group, { zone: "portal", label: "坑口付け", grow: "y" }, [
    ["concreteDark", [extrude(face, 0.5, "z", [0, 0, PORTAL_Z + 0.3])]],
    ["steel", [extrude(annulusSector(5.7, 6.1, 0, Math.PI, 0, SPRING), 0.4, "z", [0, 0, PORTAL_Z + 0.8], 28), box(0.4, SPRING + 0.6, 0.4, [5.9, (SPRING - 0.6) / 2, PORTAL_Z + 0.8]), box(0.4, SPRING + 0.6, 0.4, [-5.9, (SPRING - 0.6) / 2, PORTAL_Z + 0.8])]],
  ])

  // 坑門工（面壁型）と翼壁
  const headwall = polygon([[-10, -1.4], [10, -1.4], [10, 11.5], [-10, 11.5]], [opening(OUTER - 0.3).reverse()])
  const wing = (side: number) => extrude(polygon([[0, -0.6], [side * 0.8, -0.6], [side * 0.8, 6], [0, 11.5]]), 7, "z", [side * 10, 0, PORTAL_Z + 5.2])
  zoneParts(group, { zone: "portal-finish", label: "坑門工", grow: "y" }, [
    ["concrete", [extrude(headwall, 1.4, "z", [0, 0, PORTAL_Z + 1.6]), wing(1), wing(-1), box(21, 0.6, 2.2, [0, 11.8, PORTAL_Z + 1.6])]],
  ])

  // 坑外ヤード
  context(group, "asphaltOld", [box(9, 0.12, 40, [0, 0.06, PORTAL_Z + 22])], "approach-road")
  context(group, "gravel", [box(30, 0.08, 24, [-22, 0.04, PORTAL_Z + 20])], "yard")
  context(group, "soilDark", [sphere(5, [-26, 0, PORTAL_Z + 14], [1.4, 0.6, 1.1], 14)], "muck-pile")
  context(group, "steel", [cyl(1.4, 9, [-30, 4.5, PORTAL_Z + 28], "y", 16), cyl(1.4, 9, [-26.5, 4.5, PORTAL_Z + 28], "y", 16), box(8, 3, 4, [-28.5, 1.5, PORTAL_Z + 24])], "batcher-plant")
  context(group, "yellow", [cyl(0.6, 16, [7.5, 1.2, PORTAL_Z + 8], "z", 16), box(2.5, 2.4, 3, [7.5, 1.2, PORTAL_Z + 17])], "ventilation")
  group.add(siteOffice([18, 0, PORTAL_Z + 26], Math.PI, 2))
  group.add(dumpTruck([-14, 0, PORTAL_Z + 12], 0.5, "soilDark"))
  group.add(dumpTruck([3, 0, PORTAL_Z + 24], Math.PI / 2))
  group.add(excavator([-20, 0, PORTAL_Z + 10], 2.4, 0.6))
  ;([[-2, PORTAL_Z + 4], [2.5, PORTAL_Z + 6], [-6, PORTAL_Z + 16], [-1, PORTAL_Z - 10], [1.5, PORTAL_Z - 18]] as Array<[number, number]>).forEach(([x, z], i) => group.add(worker([x, 0, z], i * 1.1)))
  ;([[4.5, PORTAL_Z + 12], [-4.5, PORTAL_Z + 12], [4.5, PORTAL_Z + 18]] as Array<[number, number]>).forEach(([x, z]) => group.add(cone([x, 0, z] as Vec3)))
  ;([[30, 30], [36, 22], [-40, 40], [24, 44], [-44, 26]] as Array<[number, number]>).forEach(([x, z], i) => group.add(tree([x, mountain(x, z), z], 1 + (i % 2) * 0.3)))
  return { title: "山岳トンネル（NATM・2 車線）", root: group, camera: [40, 26, 46], target: [0, 3, -10] }
}
