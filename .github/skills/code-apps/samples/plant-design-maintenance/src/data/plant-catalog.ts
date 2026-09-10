import { PLANT_MODEL_ID, PLANT_MODEL_NAME, PLANT_NODES, type PlantNode, type PlantKind } from "./plant-model.ts"
import { routedConnection, validatePlantConnections } from "./plant-network.ts"

export type PlantSample = { id: string; name: string; code: string; nodes: PlantNode[] }
export type PlantPart = { id: string; name: string; position: [number, number, number]; size: [number, number, number] }

function equipment(kind: PlantKind, id: string, tag: string, name: string, area: string, position: [number, number, number]): PlantNode {
  const template = PLANT_NODES.find((node) => node.kind === kind)!
  return { ...template, id, tag, name, area, position, properties: { ...template.properties }, documentIds: [] }
}

const BASE_SAMPLES: PlantSample[] = [
  { id: PLANT_MODEL_ID, name: PLANT_MODEL_NAME, code: "DEMO-01", nodes: PLANT_NODES },
  { id: "demo-water-plant-r1", name: "水処理プラント / DEMO-02", code: "DEMO-02", nodes: [
    equipment("tank", "tk101", "TK-101", "原水槽", "取水", [-8, 0, 0]),
    equipment("pump", "p101", "P-101", "原水ポンプ A", "取水", [-4, 0, -3]),
    equipment("pump", "p102", "P-102", "原水ポンプ B", "取水", [-4, 0, 3]),
    equipment("valve", "v101", "V-101", "取水調整弁", "取水", [-6, 0.9, 0]),
    equipment("tower", "filter1", "F-201", "ろ過塔 A", "ろ過", [1, 0, -3]),
    equipment("tower", "filter2", "F-202", "ろ過塔 B", "ろ過", [1, 0, 3]),
    equipment("valve", "v201", "V-201", "逆洗弁", "ろ過", [3, 0.9, 3]),
    equipment("pump", "p201", "P-201", "送水ポンプ", "送水", [5, 0, 0]),
    equipment("tank", "tk201", "TK-201", "処理水槽 A", "送水", [9, 0, -4]),
    equipment("tank", "tk202", "TK-202", "処理水槽 B", "送水", [9, 0, 4]),
    equipment("pipe", "line101", "L-101", "取水配管", "取水", [-6, 1, 0]),
    equipment("pipe", "line201", "L-201", "送水配管", "送水", [6, 1, 0]),
  ] },
  { id: "demo-utility-plant-r1", name: "熱供給プラント / DEMO-03", code: "DEMO-03", nodes: [
    equipment("tank", "tk101", "TK-101", "補給水槽", "補給水", [-8, 0, -4]),
    equipment("tank", "tk102", "TK-102", "戻り水槽", "補給水", [-8, 0, 4]),
    equipment("pump", "p101", "P-101", "循環ポンプ A", "循環", [-3.5, 0, -4]),
    equipment("pump", "p102", "P-102", "循環ポンプ B", "循環", [-3.5, 0, 0]),
    equipment("pump", "p103", "P-103", "循環ポンプ C", "循環", [-3.5, 0, 4]),
    equipment("exchanger", "hx101", "HX-101", "熱交換器 A", "熱交換", [2, 0, -4]),
    equipment("exchanger", "hx102", "HX-102", "熱交換器 B", "熱交換", [2, 0, 0]),
    equipment("exchanger", "hx103", "HX-103", "熱交換器 C", "熱交換", [2, 0, 4]),
    equipment("tower", "c101", "C-101", "脱気塔", "補給水", [8, 0, 0]),
    equipment("valve", "v101", "V-101", "温水調整弁 A", "熱交換", [5, 1, -4]),
    equipment("valve", "v102", "V-102", "温水調整弁 B", "熱交換", [5, 1, 4]),
    equipment("pipe", "line101", "L-101", "循環配管 A", "循環", [-6, 1, -4]),
    equipment("pipe", "line102", "L-102", "循環配管 B", "循環", [-6, 1, 4]),
    equipment("pipe", "line201", "L-201", "温水供給配管", "熱交換", [6, 1, 0]),
  ] },
]

function complexPlant(base: PlantSample, sampleIndex: number): PlantSample {
  const nodes: PlantNode[] = []
  const add = (kind: PlantKind, id: string, tag: string, name: string, area: string, position: PlantNode["position"]) => {
    const original = base.nodes.find((node) => node.id === id && node.kind === kind)
    nodes.push({ ...(original ?? equipment(kind, id, tag, name, area, position)), id, tag, name, area, position })
  }
  const rows = [-10, 0, 10]
  const inletNames = ["原料貯槽", "原水槽", "補給水槽"]
  const treatmentNames = ["原料予熱器", "ろ過塔", "温水熱交換器"]
  const towerNames = ["分離塔", "殺菌熱交換器", "脱気塔"]
  const outputNames = ["製品貯槽", "処理水槽", "蓄熱槽"]
  rows.forEach((row, index) => {
    const suffix = index + 1
    const area = `第 ${suffix} 系列`
    add("tank", `tk10${suffix}`, `TK-10${suffix}`, `${inletNames[sampleIndex]} ${suffix}`, area, [-18, 0, row])
    add("valve", `v10${suffix}`, `V-10${suffix}`, `入口調整弁 ${suffix}`, area, [-13, 1, row])
    add("pump", `p10${suffix}`, `P-10${suffix}`, `移送ポンプ ${suffix}`, area, [-8, 0, row])
    add(sampleIndex === 1 ? "tower" : "exchanger", sampleIndex === 1 ? `filter${suffix}` : `hx10${suffix}`, sampleIndex === 1 ? `F-20${suffix}` : `HX-10${suffix}`, `${treatmentNames[sampleIndex]} ${suffix}`, area, [0, 0, row])
    add(sampleIndex === 1 ? "exchanger" : "tower", `c10${suffix}`, `C-10${suffix}`, `${towerNames[sampleIndex]} ${suffix}`, area, [8, 0, row])
    add("valve", `v20${suffix}`, `V-20${suffix}`, `出口調整弁 ${suffix}`, area, [13, 1, row])
    add("tank", `tk20${suffix}`, `TK-20${suffix}`, `${outputNames[sampleIndex]} ${suffix}`, area, [18, 0, row])
    add("pump", `p20${suffix}`, `P-20${suffix}`, `回収ポンプ ${suffix}`, "回収・循環", [25, 0, row])
    nodes.push({ id: `mcc${suffix}`, tag: `MCC-10${suffix}`, name: `動力盤 ${suffix}`, area: "電気設備", kind: "component", position: [-8, 0, row + 4], size: [2, 2.4, 0.9], properties: { 電源: "400 V / サンプル", 系列: String(suffix) }, documentIds: [] })
  })
  add("tank", "tk301", "TK-301", sampleIndex === 1 ? "逆洗回収槽" : "循環回収槽", "回収・循環", [32, 0, 0])
  let connectionIndex = 0
  const link = (from: string, to: string, elevation: number, lane: number, power = false) => {
    connectionIndex++
    nodes.push(routedConnection(nodes, `${power ? "cb" : "line"}-${String(connectionIndex).padStart(3, "0")}`, { nodeId: from, portId: power ? "power" : "outlet" }, { nodeId: to, portId: power ? "power" : "inlet" }, elevation, lane))
  }
  rows.forEach((row, index) => {
    const suffix = index + 1
    const chain = [`tk10${suffix}`, `v10${suffix}`, `p10${suffix}`, sampleIndex === 1 ? `filter${suffix}` : `hx10${suffix}`, `c10${suffix}`, `v20${suffix}`, `tk20${suffix}`, `p20${suffix}`]
    chain.slice(1).forEach((target, segment) => link(chain[segment], target, 3.2 + segment * 0.22, row + 2.5 + segment * 0.24))
    link(`p20${suffix}`, "tk301", 5 + index * 0.4, row - 3)
    link("tk301", `tk10${suffix}`, 6.5 + index * 0.4, -15 - index * 0.5)
    link(`mcc${suffix}`, `p10${suffix}`, 5.8, row + 4.8, true)
    link(`mcc${suffix}`, `p20${suffix}`, 6.1, row + 5.2, true)
  })
  link("mcc1", "mcc2", 6.6, 17, true)
  link("mcc2", "mcc3", 6.9, 18, true)
  const issues = validatePlantConnections(nodes)
  if (issues.length) throw new Error(issues.join("; "))
  return { ...base, nodes }
}

export const PLANT_SAMPLES: PlantSample[] = BASE_SAMPLES.map(complexPlant)

export function plantParts(node: PlantNode): PlantPart[] {
  if (node.route) {
    const points = node.route.points
    let longest = 1
    const length = (index: number) => Math.hypot(...points[index].map((value, axis) => value - points[index - 1][axis]))
    for (let index = 2; index < points.length; index++) if (length(index) > length(longest)) longest = index
    return [{ id: "joint", name: node.route.medium === "power" ? "ケーブル接続部" : "継手", position: [...points[1]], size: [0.45, 0.45, 0.45] },
      { id: "run", name: node.route.medium === "power" ? "ケーブル本体" : "配管本体", position: points[longest].map((value, axis) => (value + points[longest - 1][axis]) / 2) as PlantPart["position"], size: [0.6, 0.6, 0.6] }]
  }
  if (node.kind === "component") return [{ id: "terminal", name: "端子台", position: [0, node.size[1] / 2, node.size[2] / 2], size: [0.8, 0.5, 0.4] }]
  const [width, height, depth] = node.size
  if (node.kind === "pump") return [
    { id: "bearing", name: "駆動側軸受", position: [width * 0.4, 0.8, 0], size: [0.4, 0.8, depth * 0.8] },
    { id: "seal", name: "メカニカルシール", position: [-width * 0.3, 0.8, 0], size: [0.5, 1.2, depth] },
    { id: "coupling", name: "カップリング", position: [-width * 0.03, 0.8, 0], size: [0.35, 0.7, depth * 0.6] },
  ]
  if (node.kind === "exchanger") return [
    { id: "tubes", name: "伝熱管", position: [0, height * 0.65, 0], size: [width * 0.7, depth, depth] },
    { id: "flange", name: "フランジ部", position: [width * 0.42, height * 0.65, 0], size: [0.2, depth * 1.15, depth * 1.15] },
  ]
  if (node.kind === "valve") return [{ id: "gland", name: "グランド部", position: [0, height * 0.25, 0], size: [0.4, height * 0.65, 0.4] }]
  if (node.kind === "tank" || node.kind === "tower") return [
    { id: "gauge", name: "液位計取付部", position: [width / 2, 1, 0], size: [0.75, 0.5, 0.6] },
    { id: "shell", name: "胴部", position: [0, height / 2, 0], size: [width, height * 0.6, depth] },
  ]
  if (node.kind === "pipe") return [{ id: "joint", name: "継手", position: [width * 0.4, 0, 0], size: [0.3, height * 3, depth * 3] }]
  return []
}

export type PlantDrawing = { id: string; modelId: string; nodeId: string; number: string; title: string; revision: string }
export const PLANT_DRAWINGS: PlantDrawing[] = PLANT_SAMPLES.flatMap((sample) => sample.nodes.map((node) => ({
  id: `${sample.id}:${node.id}:drawing`, modelId: sample.id, nodeId: node.id,
  number: `${sample.code}-${node.tag}-GA`, title: `${node.name} 配置・部位図`, revision: "Rev.1",
})))

export function drawingsForEquipment(modelId: string, nodeId: string) {
  return PLANT_DRAWINGS.filter((drawing) => drawing.modelId === modelId && drawing.nodeId === nodeId)
}