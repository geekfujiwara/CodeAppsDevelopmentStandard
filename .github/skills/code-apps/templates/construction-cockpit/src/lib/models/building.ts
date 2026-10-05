// S 造の建築（階数・スパン数は ${PUBLISHER_PREFIX}_modelcenter の floors / width / depth から生成）。単位はメートル。
import { Group, type BufferGeometry } from "three"
import {
  beam, box, car, context, crawlerCrane, cyl, dumpTruck, extrude, hSection, segmentInfo, siteOffice, terrain, towerCrane,
  tree, worker, zoneParts, type ConstructionModel, type MaterialKey,
} from "./kit.ts"

const SPAN = 6

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value ?? fallback)))
}

export function buildBuilding(params: Record<string, number>): ConstructionModel {
  const floors = clamp(params.floors, 4, 1, 20)
  const bayX = clamp(params.width, 6, 2, 10)
  const bayZ = clamp(params.depth, 4, 2, 8)
  const W = bayX * SPAN
  const D = bayZ * SPAN
  const xs = Array.from({ length: bayX + 1 }, (_, i) => -W / 2 + i * SPAN)
  const zs = Array.from({ length: bayZ + 1 }, (_, i) => -D / 2 + i * SPAN)
  const height = (i: number) => (i === 0 ? 4.5 : 3.8)
  const levels = [0]
  for (let i = 0; i < floors; i += 1) levels.push(levels[i] + height(i))
  const top = levels[floors]
  const grid = xs.flatMap((x) => zs.map((z) => [x, z] as [number, number]))

  const group = new Group()
  group.name = `building-${floors}f`
  group.add(terrain(W + 90, D + 80, 0, 0, () => 0, 4))

  // 杭（場所打ち杭 φ1.2 m）
  const pileSegments = Math.min(24, grid.length)
  for (let s = 0; s < pileSegments; s += 1) {
    const points = grid.filter((_, index) => index % pileSegments === s)
    zoneParts(group, segmentInfo("pile", "場所打ち杭", s, pileSegments, { grow: "y" }), [["concreteDark", points.map(([x, z]) => cyl(0.6, 13.8, [x, -9.1, z], "y", 14))]])
  }

  // 基礎（パイルキャップ・基礎梁・耐圧版）
  zoneParts(group, { zone: "foundation", label: "根切り・基礎躯体", grow: "x" }, [["concrete", [
    ...grid.map(([x, z]) => box(2.2, 1.5, 2.2, [x, -1.45, z])),
    ...zs.map((z) => box(W, 1.2, 0.8, [0, -1.0, z])),
    ...xs.map((x) => box(0.8, 1.2, D, [x, -1.0, 0])),
    box(W + 1.2, 0.25, D + 1.2, [0, -0.125, 0]),
  ]]])

  for (let i = 0; i < floors; i += 1) {
    const y0 = levels[i]
    const h = height(i)
    const y1 = levels[i + 1]
    const floorLabel = `${i + 1} 階`

    // 鉄骨（柱・大梁・ブレース）
    const columns = grid.map(([x, z]) => extrude(hSection(0.45, 0.45, 0.022, 0.032), h, "y", [x, y0 + h / 2, z]))
    const girders: BufferGeometry[] = [
      ...zs.map((z) => extrude(hSection(0.7, 0.3, 0.016, 0.026), W, "x", [0, y1 - 0.35, z])),
      ...xs.map((x) => extrude(hSection(0.7, 0.3, 0.016, 0.026), D, "z", [x, y1 - 0.35, 0])),
    ]
    const braceBays = bayX > 2 ? [0, bayX - 1] : [0]
    for (const z of [zs[0], zs[bayZ]]) {
      for (const b of braceBays) {
        girders.push(beam([xs[b], y0 + 0.2, z], [xs[b + 1], y1 - 0.7, z], 0.2), beam([xs[b + 1], y0 + 0.2, z], [xs[b], y1 - 0.7, z], 0.2))
      }
    }
    zoneParts(group, segmentInfo("frame", `鉄骨建方 ${floorLabel}`, i, floors, { grow: "y" }), [["steelDark", columns], ["girder", girders]])

    // 床（デッキスラブ）
    zoneParts(group, segmentInfo("slab", `床スラブ ${floorLabel}`, i, floors, { grow: "x" }), [["concrete", [box(W + 0.4, 0.2, D + 0.4, [0, y1 - 0.1, 0])]]])

    // 外部足場（建地・布・踏板・メッシュシート）。完成形には含めない
    const standards: BufferGeometry[] = []
    const ledgers: BufferGeometry[] = []
    const planks: BufferGeometry[] = []
    const sheets: BufferGeometry[] = []
    const sides: Array<{ length: number; at: (t: number, offset: number) => [number, number]; along: "x" | "z" }> = [
      { length: W + 4, along: "x", at: (t, o) => [t, D / 2 + o] },
      { length: W + 4, along: "x", at: (t, o) => [t, -D / 2 - o] },
      { length: D + 4, along: "z", at: (t, o) => [W / 2 + o, t] },
      { length: D + 4, along: "z", at: (t, o) => [-W / 2 - o, t] },
    ]
    for (const side of sides) {
      const place = (w: number, hh: number, l: number, center: [number, number], y: number) =>
        side.along === "x" ? box(l, hh, w, [center[0], y, center[1]]) : box(w, hh, l, [center[0], y, center[1]])
      for (const offset of [1.0, 1.9]) {
        for (let t = -side.length / 2; t <= side.length / 2 + 0.01; t += 1.8) standards.push(place(0.06, h, 0.06, side.at(t, offset), y0 + h / 2))
        for (const y of [y0 + 0.15, y0 + h * 0.55, y1 - 0.05]) ledgers.push(place(0.05, 0.05, side.length, side.at(0, offset), y))
      }
      planks.push(place(0.85, 0.05, side.length, side.at(0, 1.45), y0 + 0.1))
      sheets.push(place(0.02, h, side.length, side.at(0, 2.0), y0 + h / 2))
    }
    zoneParts(group, segmentInfo("scaffold", `外部足場 ${floorLabel}`, i, floors, { grow: "y", temporary: true }), [
      ["scaffold", [...standards, ...ledgers]], ["plank", planks], ["meshSheet", sheets],
    ])

    // 外装（カーテンウォール：方立・無目・ガラス・スパンドレル）
    const mullions: BufferGeometry[] = []
    const glass: BufferGeometry[] = []
    const spandrels: BufferGeometry[] = []
    const facades: Array<{ length: number; along: "x" | "z"; offset: number; sign: number }> = [
      { length: W + 0.6, along: "x", offset: D / 2 + 0.4, sign: 1 }, { length: W + 0.6, along: "x", offset: D / 2 + 0.4, sign: -1 },
      { length: D + 0.6, along: "z", offset: W / 2 + 0.4, sign: 1 }, { length: D + 0.6, along: "z", offset: W / 2 + 0.4, sign: -1 },
    ]
    for (const facade of facades) {
      const place = (along: number, w: number, hh: number, l: number, y: number) =>
        facade.along === "x" ? box(l, hh, w, [along, y, facade.sign * facade.offset]) : box(w, hh, l, [facade.sign * facade.offset, y, along])
      for (let t = -facade.length / 2; t <= facade.length / 2 + 0.01; t += 1.5) mullions.push(place(t, 0.18, h, 0.08, y0 + h / 2))
      mullions.push(place(0, 0.16, 0.08, facade.length, y0 + 0.95), place(0, 0.16, 0.08, facade.length, y1 - 0.05))
      glass.push(place(0, 0.03, h - 1.05, facade.length, y0 + 0.95 + (h - 1.05) / 2))
      spandrels.push(place(0, 0.06, 0.9, facade.length, y0 + 0.45))
    }
    zoneParts(group, segmentInfo("envelope", `外装 ${floorLabel}`, i, floors, { grow: "y" }), [["steel", mullions], ["glass", glass], ["duct", spandrels]])

    // 設備（ダクト・配管・ケーブルラック）
    const branches = xs.filter((_, k) => k % 2 === 1).map((x) => box(0.5, 0.35, D * 0.6, [x, y1 - 0.85, 0]))
    zoneParts(group, segmentInfo("mep", `設備 ${floorLabel}`, i, floors, { grow: "x" }), [
      ["duct", [box(W * 0.8, 0.5, 0.9, [0, y1 - 0.9, -D * 0.15]), ...branches]],
      ["pipeRed", [cyl(0.08, W * 0.8, [0, y1 - 0.75, D * 0.2], "x", 10)]],
      ["pipeBlue", [cyl(0.08, W * 0.8, [0, y1 - 0.75, D * 0.2 + 0.3], "x", 10)]],
      ["steel", [box(W * 0.8, 0.08, 0.5, [0, y1 - 0.6, D * 0.3])]],
    ])

    // 内装（コア・間仕切り）
    const partitionHeight = h - 0.6
    const partitions: BufferGeometry[] = [box(W * 0.8, partitionHeight, 0.12, [0, y0 + partitionHeight / 2, -D * 0.05])]
    xs.slice(1, -1).forEach((x, k) => { if (k % 2 === 0) partitions.push(box(0.12, partitionHeight, D * 0.4, [x, y0 + partitionHeight / 2, D * 0.2])) })
    zoneParts(group, segmentInfo("interior", `内装 ${floorLabel}`, i, floors, { grow: "x" }), [
      ["concreteDark", [box(SPAN * 1.2, h - 0.2, SPAN * 0.9, [0, y0 + (h - 0.2) / 2, -D * 0.3])]],
      ["partition", partitions],
    ])
  }

  // 屋上（防水・パラペット・設備）
  const parapets = [
    box(W + 0.4, 1.1, 0.25, [0, top + 0.55, D / 2 + 0.1]), box(W + 0.4, 1.1, 0.25, [0, top + 0.55, -D / 2 - 0.1]),
    box(0.25, 1.1, D + 0.4, [W / 2 + 0.1, top + 0.55, 0]), box(0.25, 1.1, D + 0.4, [-W / 2 - 0.1, top + 0.55, 0]),
  ]
  zoneParts(group, { zone: "roof", label: "屋上防水・設備", grow: "x" }, [
    ["waterproof", [box(W, 0.08, D, [0, top + 0.04, 0])]],
    ["concrete", [...parapets, box(SPAN * 1.2, 3.5, SPAN * 0.9, [0, top + 1.75, -D * 0.3])]],
    ["steel", [box(3, 2, 1.6, [W * 0.25, top + 1, D * 0.2]), box(3, 2, 1.6, [W * 0.25 + 3.6, top + 1, D * 0.2]), cyl(1.5, 3, [-W * 0.3, top + 1.5, D * 0.2], "y", 18)]],
  ])

  // 外構（周囲の舗装・駐車場・植栽帯）
  const ring = 7
  const apron: Array<[number, number, number, number]> = [
    [0, D / 2 + ring / 2 + 1, W + ring * 2 + 2, ring], [0, -D / 2 - ring / 2 - 1, W + ring * 2 + 2, ring],
    [W / 2 + ring / 2 + 1, 0, ring, D + 2], [-W / 2 - ring / 2 - 1, 0, ring, D + 2],
  ]
  apron.forEach(([x, z, w, d], index) => {
    const lines: BufferGeometry[] = []
    if (index === 0) for (let t = -W / 2; t <= W / 2; t += 2.5) lines.push(box(0.12, 0.012, 5, [t, 0.13, z]))
    const layers: Array<[MaterialKey, BufferGeometry[]]> = [["asphalt", [box(w, 0.12, d, [x, 0.06, z])]], ["white", lines]]
    if (index === 0) layers.push(["concreteDark", [box(8, 0.2, 4, [0, 3.6, D / 2 + 2]), box(0.2, 3.6, 0.2, [-3.8, 1.8, D / 2 + 3.8]), box(0.2, 3.6, 0.2, [3.8, 1.8, D / 2 + 3.8])]])
    if (index === 1) layers.push(["grass", [box(w - 4, 0.25, 1.6, [x, 0.12, z - d / 2 + 1])]])
    zoneParts(group, segmentInfo("exterior", "外構工事", index, 4, { grow: index < 2 ? "x" : "z" }), layers)
  })

  // 周辺の街区（道路・近隣建物）
  const streetZ = D / 2 + ring + 6
  context(group, "asphaltOld", [box(W + 90, 0.1, 9, [0, 0.05, streetZ]), box(9, 0.1, D + 80, [W / 2 + ring + 10, 0.05, 0])], "street")
  context(group, "white", Array.from({ length: Math.floor((W + 80) / 6) }, (_, k) => box(3, 0.012, 0.15, [-W / 2 - 40 + k * 6, 0.11, streetZ])), "street-markings")
  const neighbours: Array<[number, number, number, number, number]> = [[-W / 2 - 22, -6, 14, 22, 18], [-W / 2 - 24, -D / 2 - 26, 16, 16, 30], [W / 2 + 30, -D / 2 - 18, 18, 14, 24]]
  for (const [x, z, w, d, hh] of neighbours) {
    context(group, "concreteDark", [box(w, hh, d, [x, hh / 2, z])], "neighbour")
    context(group, "glass", Array.from({ length: Math.floor(hh / 3.5) }, (_, k) => box(w + 0.1, 1.4, d + 0.1, [x, 2 + k * 3.5, z])), "neighbour-windows")
  }
  if (floors > 6) group.add(towerCrane([W / 2 + 5, 0, -D / 2 - 5], 0.6, top + 14, Math.max(32, W + 12)))
  else group.add(crawlerCrane([W / 2 + 9, 0, 4], Math.PI - 0.3, 30, 1.15, 12))
  group.add(siteOffice([-W / 2 - 10, 0, D / 2 + ring + 1], 0, 3))
  group.add(dumpTruck([W / 2 + ring + 10, 0, -6], Math.PI / 2))
  group.add(car([-12, 0, streetZ + 2], 0, "red"))
  group.add(car([14, 0, streetZ - 2], Math.PI, "white"))
  ;([[-W / 2 - 3, D / 2 + 3], [W / 2 + 3, D / 2 + 4], [0, D / 2 + 5], [W / 2 + 4, -2]] as Array<[number, number]>).forEach(([x, z], i) => group.add(worker([x, 0, z], i)))
  for (let k = 0; k < 6; k += 1) group.add(tree([-W / 2 + (W / 5) * k, 0, -D / 2 - ring - 2.5], 0.8))

  const extent = Math.max(top, W, D)
  return {
    title: `S 造 ${floors} 階建て（${bayX}×${bayZ} スパン）`,
    root: group,
    camera: [W / 2 + extent * 0.9 + 14, top * 0.65 + extent * 0.45 + 8, D / 2 + extent * 1.1 + 16],
    target: [0, top * 0.42, 0],
  }
}
