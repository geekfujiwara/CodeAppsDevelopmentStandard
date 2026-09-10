export type PlantKind = "tank" | "pump" | "exchanger" | "valve" | "pipe" | "tower" | "component"
export type PlantPoint = [number, number, number]
export type PlantTerminal = { nodeId: string; portId: string }
export type PlantRoute = { medium: "process" | "power"; from: PlantTerminal; to: PlantTerminal; points: PlantPoint[]; radius: number }
export type PlantNode = {
  id: string
  tag: string
  name: string
  area: string
  kind: PlantKind
  position: [number, number, number]
  size: [number, number, number]
  properties: Record<string, string>
  documentIds: string[]
  route?: PlantRoute
  rotation?: number
}

export const PLANT_MODEL_ID = "demo-process-plant-r1"
export const PLANT_MODEL_NAME = "プロセスプラント / DEMO-01"

export const PLANT_DOCUMENTS = [
  { id: "flow", number: "DEMO-PID-001", title: "プロセス系統図・運転条件", revision: "Rev.1", sections: [
    { heading: "対象系統", body: "原料貯槽 TK-101 / TK-102 → 移送ポンプ P-101 / P-102 → 熱交換器 HX-101 → 分離塔 C-101 → 製品貯槽 TK-201。これは操作検証用の架空の系統です。" },
    { heading: "設計条件（サンプル）", body: "移送流量 45 m³/h、熱交換器入口 25 °C、出口 65 °C。表示値は設計・運転判断には使用できません。" },
  ] },
  { id: "pump", number: "DEMO-ME-101", title: "移送ポンプ仕様・点検要領", revision: "Rev.1", sections: [
    { heading: "設備仕様", body: "P-101 は常用、P-102 は予備の遠心ポンプ。接液部材質 SUS316L、定格流量 45 m³/h、揚程 32 m、電動機 11 kW（すべてサンプル値）。" },
    { heading: "記録項目", body: "軸受温度、振動、軸封部の状態を点検記録に残す。実設備の作業手順は、承認された設備固有の文書を参照すること。" },
  ] },
  { id: "thermal", number: "DEMO-TH-101", title: "熱交換器・分離塔 設計概要", revision: "Rev.1", sections: [
    { heading: "熱交換器", body: "HX-101 は横置きシェル＆チューブ式。伝熱面積 28 m²、設計圧力 1.0 MPa。モデルは外形のみを表したサンプルです。" },
    { heading: "分離塔", body: "C-101 の塔径は 2.4 m、胴高さは 8 m。塔頂・塔底ノズルと支持脚を簡略化して表示します。" },
  ] },
  { id: "tank", number: "DEMO-ME-201", title: "貯槽・配管 材料仕様", revision: "Rev.1", sections: [
    { heading: "貯槽", body: "原料・製品貯槽は縦置き円筒形。TK-101 / TK-102 は各 30 m³、TK-201 は 40 m³（サンプル）。設備タグをキーに仕様書を紐づけます。" },
    { heading: "配管", body: "主配管は 100A、接液材質 SUS316L。配管ルートはビューアー検証用の概略であり、施工図ではありません。" },
  ] },
] as const

export const PLANT_NODES: PlantNode[] = [
  { id: "tk101", tag: "TK-101", name: "原料貯槽 A", area: "原料供給", kind: "tank", position: [-8, 0, -4], size: [3.2, 4.8, 3.2], properties: { 容量: "30 m³", 材質: "SUS316L", 設計圧力: "0.3 MPa" }, documentIds: ["flow", "tank"] },
  { id: "tk102", tag: "TK-102", name: "原料貯槽 B", area: "原料供給", kind: "tank", position: [-8, 0, 3], size: [3.2, 4.8, 3.2], properties: { 容量: "30 m³", 材質: "SUS316L", 設計圧力: "0.3 MPa" }, documentIds: ["flow", "tank"] },
  { id: "p101", tag: "P-101", name: "原料移送ポンプ A", area: "原料供給", kind: "pump", position: [-3.8, 0, -4], size: [2.4, 1.4, 1.3], properties: { 役割: "常用", 流量: "45 m³/h", 揚程: "32 m", 電動機: "11 kW" }, documentIds: ["pump", "flow"] },
  { id: "p102", tag: "P-102", name: "原料移送ポンプ B", area: "原料供給", kind: "pump", position: [-3.8, 0, 3], size: [2.4, 1.4, 1.3], properties: { 役割: "予備", 流量: "45 m³/h", 揚程: "32 m", 電動機: "11 kW" }, documentIds: ["pump", "flow"] },
  { id: "hx101", tag: "HX-101", name: "原料予熱器", area: "熱交換・分離", kind: "exchanger", position: [1.2, 0, -3], size: [4.2, 2.2, 1.8], properties: { 形式: "シェル＆チューブ", 伝熱面積: "28 m²", 設計圧力: "1.0 MPa", 出口温度: "65 °C" }, documentIds: ["thermal", "flow"] },
  { id: "c101", tag: "C-101", name: "分離塔", area: "熱交換・分離", kind: "tower", position: [5.8, 0, -3], size: [2.4, 8, 2.4], properties: { 塔径: "2.4 m", 胴高さ: "8 m", 材質: "SUS316L" }, documentIds: ["thermal", "flow"] },
  { id: "tk201", tag: "TK-201", name: "製品貯槽", area: "製品回収", kind: "tank", position: [8, 0, 4], size: [3.8, 5.2, 3.8], properties: { 容量: "40 m³", 材質: "SUS316L", 設計圧力: "0.3 MPa" }, documentIds: ["tank", "flow"] },
  { id: "v101", tag: "V-101", name: "原料入口弁 A", area: "原料供給", kind: "valve", position: [-5.8, 0.9, -4], size: [0.8, 0.9, 0.8], properties: { 呼び径: "100A", 形式: "ゲート弁" }, documentIds: ["flow", "tank"] },
  { id: "v102", tag: "V-102", name: "原料入口弁 B", area: "原料供給", kind: "valve", position: [-5.8, 0.9, 3], size: [0.8, 0.9, 0.8], properties: { 呼び径: "100A", 形式: "ゲート弁" }, documentIds: ["flow", "tank"] },
  { id: "v201", tag: "V-201", name: "製品出口弁", area: "製品回収", kind: "valve", position: [6, 0.9, 4], size: [0.8, 0.9, 0.8], properties: { 呼び径: "100A", 形式: "ゲート弁" }, documentIds: ["flow"] },
  { id: "line101", tag: "L-101", name: "原料移送配管 A", area: "原料供給", kind: "pipe", position: [-5.8, 0.95, -4], size: [4.4, 0.18, 0.18], properties: { 呼び径: "100A", 材質: "SUS316L" }, documentIds: ["flow", "tank"] },
  { id: "line102", tag: "L-102", name: "原料移送配管 B", area: "原料供給", kind: "pipe", position: [-5.8, 0.95, 3], size: [4.4, 0.18, 0.18], properties: { 呼び径: "100A", 材質: "SUS316L" }, documentIds: ["flow", "tank"] },
  { id: "line103", tag: "L-103", name: "予熱器入口配管", area: "熱交換・分離", kind: "pipe", position: [-1.6, 1.2, -3], size: [2, 0.18, 0.18], properties: { 呼び径: "100A", 材質: "SUS316L" }, documentIds: ["flow"] },
  { id: "line104", tag: "L-104", name: "分離塔入口配管", area: "熱交換・分離", kind: "pipe", position: [4, 1.2, -3], size: [2.8, 0.18, 0.18], properties: { 呼び径: "100A", 材質: "SUS316L" }, documentIds: ["flow"] },
  { id: "line201", tag: "L-201", name: "製品回収配管", area: "製品回収", kind: "pipe", position: [6.5, 0.95, 4], size: [3, 0.18, 0.18], properties: { 呼び径: "100A", 材質: "SUS316L" }, documentIds: ["flow", "tank"] },
]

export const KIND_LABELS: Record<PlantKind, string> = {
  tank: "貯槽", pump: "ポンプ", exchanger: "熱交換器", valve: "バルブ", pipe: "配管", tower: "塔槽", component: "部品",
}

export function searchPlantNodes(query: string, area = "all", kind = "all", nodes = PLANT_NODES) {
  const terms = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return nodes.filter((node) => {
    const text = [node.tag, node.name, node.area, KIND_LABELS[node.kind], ...Object.values(node.properties)].join(" ").normalize("NFKC").toLocaleLowerCase()
    return (area === "all" || node.area === area) && (kind === "all" || node.kind === kind) && terms.every((term) => text.includes(term))
  })
}

export function documentsForNode(nodeId: string) {
  const node = PLANT_NODES.find((candidate) => candidate.id === nodeId)
  return PLANT_DOCUMENTS.filter((document) => node?.documentIds.includes(document.id))
}