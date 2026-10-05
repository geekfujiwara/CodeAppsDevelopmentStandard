// 道路舗装の打換え（片側交互通行で施工車線を打ち換える）。道路は x 方向に延長 60 m。単位はメートル。
import { Group, type BufferGeometry } from "three"
import {
  asphaltFinisher, beam, box, car, cone, context, cyl, dumpTruck, lampPost, roller, segmentInfo, terrain, tree, worker,
  zoneParts, type ConstructionModel, type MaterialKey,
} from "./kit.ts"

const LENGTH = 60
const SEGMENTS = 8
const STEP = LENGTH / SEGMENTS
// 施工車線（z = -4.5〜0）の舗装構成：上端の高さ
const LAYERS: Array<{ zone: string; label: string; top: number; bottom: number; key: MaterialKey }> = [
  { zone: "subgrade", label: "路床改良", top: -0.6, bottom: -1.1, key: "soil" },
  { zone: "subbase", label: "下層路盤", top: -0.3, bottom: -0.6, key: "gravelDark" },
  { zone: "base", label: "上層路盤", top: -0.11, bottom: -0.3, key: "gravel" },
  { zone: "binder", label: "基層", top: -0.05, bottom: -0.11, key: "asphalt" },
  { zone: "surface", label: "表層", top: 0, bottom: -0.05, key: "asphaltFresh" },
]

function ground(x: number, z: number): number {
  if (Math.abs(x) < LENGTH / 2 + 0.05 && z > -4.6 && z < 0.05) return -1.1
  // 既設舗装・歩道の下は地形を下げ、上面が重なってちらつかないようにする
  if (Math.abs(z) < 7.5) return -0.25
  return 0.15
}

export function buildRoad(): ConstructionModel {
  const group = new Group()
  group.name = "road-pavement"
  group.add(terrain(110, 50, 0, 0, ground, 0.5))
  const x = (i: number) => -LENGTH / 2 + STEP * (i + 0.5)

  for (const layer of LAYERS) {
    for (let i = 0; i < SEGMENTS; i += 1) {
      const thickness = layer.top - layer.bottom
      zoneParts(group, segmentInfo(layer.zone, layer.label, i, SEGMENTS, { grow: "x" }), [
        [layer.key, [box(STEP - 0.01, thickness, 4.5, [x(i), layer.bottom + thickness / 2, -2.25])]],
      ])
    }
  }

  // 区画線（外側線・中央の破線・道路鋲）
  for (let i = 0; i < SEGMENTS; i += 1) {
    zoneParts(group, segmentInfo("marking", "区画線・道路鋲", i, SEGMENTS, { grow: "x" }), [
      ["white", [box(STEP, 0.012, 0.15, [x(i), 0.006, -4.3]), box(3, 0.012, 0.15, [x(i) - 1.5, 0.006, -0.08])]],
      ["yellow", [box(0.15, 0.04, 0.1, [x(i) + 1.5, 0.02, -0.08])]],
    ])
  }

  // 交通規制（コーン・バリケード・矢印板）。完成形には含めない
  for (let i = 0; i < SEGMENTS; i += 1) {
    const cones: BufferGeometry[] = []
    const stripes: BufferGeometry[] = []
    for (let k = 0; k < 3; k += 1) {
      const cx = x(i) - STEP / 2 + 1.25 + k * 2.5
      cones.push(box(0.4, 0.75, 0.4, [cx, 0.38, 0.35]))
      stripes.push(box(0.42, 0.12, 0.42, [cx, 0.5, 0.35]))
    }
    const layers: Array<[MaterialKey, BufferGeometry[]]> = [["orange", cones], ["white", stripes]]
    if (i === 0 || i === SEGMENTS - 1) {
      const end = i === 0 ? x(i) - STEP / 2 + 0.5 : x(i) + STEP / 2 - 0.5
      layers.push(["yellow", [box(0.15, 1.0, 4.4, [end, 0.9, -2.25]), box(0.1, 1.6, 0.1, [end, 0.8, -4.2]), box(0.1, 1.6, 0.1, [end, 0.8, -0.3])]])
      layers.push(["black", [box(0.16, 0.25, 4.4, [end, 1.15, -2.25])]])
    }
    zoneParts(group, segmentInfo("site", "交通規制", i, SEGMENTS, { grow: "x", temporary: true }), layers)
  }

  // 既設車線（通行中）と歩道・縁石
  context(group, "gravelDark", [box(LENGTH + 40, 1.0, 4.6, [0, -0.6, 2.3])], "existing-base")
  context(group, "asphaltOld", [box(LENGTH + 40, 0.1, 4.6, [0, -0.05, 2.3]), box(20, 0.1, 4.5, [-LENGTH / 2 - 10, -0.05, -2.25]), box(20, 0.1, 4.5, [LENGTH / 2 + 10, -0.05, -2.25])], "existing-lane")
  context(group, "white", [box(LENGTH + 40, 0.012, 0.15, [0, 0.006, 4.4]), ...[-48, -42, -36, 33, 39, 45].map((mx) => box(3, 0.012, 0.15, [mx, 0.006, -0.08])), box(20, 0.012, 0.15, [-LENGTH / 2 - 10, 0.006, -4.3]), box(20, 0.012, 0.15, [LENGTH / 2 + 10, 0.006, -4.3])], "existing-markings")
  for (const side of [-1, 1]) {
    const z = side === 1 ? 4.75 : -4.75
    context(group, "concreteDark", [box(LENGTH + 40, 0.25, 0.3, [0, 0.12, z])], "curb")
    context(group, "precast", [box(LENGTH + 40, 0.15, 2.5, [0, 0.08, z + side * 1.4])], "sidewalk")
  }
  const wires: BufferGeometry[] = []
  for (let k = 0; k < 4; k += 1) {
    const px = -36 + k * 24
    context(group, "concrete", [cyl(0.18, 11, [px, 5.5, 7.4], "y", 10, 0.13), box(2.2, 0.15, 0.15, [px, 10.2, 7.4])], "utility-pole")
    if (k < 3) for (const dz of [-0.9, 0.9]) wires.push(beam([px, 10.2, 7.4 + dz * 0.3], [px + 24, 10.2, 7.4 + dz * 0.3], 0.03))
  }
  context(group, "black", wires, "wires")

  group.add(asphaltFinisher([6, 0, -2.25], Math.PI))
  group.add(roller([-4, 0, -2.25], 0))
  group.add(dumpTruck([14, 0, -2.25], Math.PI, "asphalt"))
  group.add(car([-18, 0, 2.3], 0, "white"))
  group.add(car([12, 0, 2.3], 0, "blue"))
  group.add(car([34, 0, 2.3], 0, "red"))
  ;([[0, -3.4], [8, -0.8], [-10, -1.2], [-27, 0.8], [26, 0.8]] as Array<[number, number]>).forEach(([wx, wz], i) => group.add(worker([wx, 0, wz], i * 0.8, i > 2 ? "yellow" : "vest")))
  ;([[-30, 0.35], [30, 0.35]] as Array<[number, number]>).forEach(([cx, cz]) => group.add(cone([cx, 0, cz])))
  for (let k = 0; k < 7; k += 1) {
    group.add(tree([-36 + k * 12, 0.15, -6.9], 0.75))
    if (k % 2 === 0) group.add(lampPost([-36 + k * 12 + 6, 0.15, 6.4], Math.PI / 2, 8))
  }
  return { title: "道路舗装の打換え（片側交互通行）", root: group, camera: [26, 15, 26], target: [0, -0.4, 0] }
}
