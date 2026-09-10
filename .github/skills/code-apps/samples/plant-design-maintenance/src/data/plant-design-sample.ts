import { PLANT_NODES, type PlantKind, type PlantPoint } from "./plant-model.ts"
import { rectangle, type ModuleEquipment, type PlantDesign, type PlantModule } from "./plant-design.ts"

function equipment(kind: PlantKind, id: string, position: PlantPoint): ModuleEquipment {
  const template = PLANT_NODES.find((node) => node.kind === kind)!
  return { id, tag: id.toUpperCase(), name: template.name, kind, position, size: [...template.size], properties: { ...template.properties } }
}

export const DESIGN_MODULES: PlantModule[] = [
  { id: "feed", name: "原料移送ユニット", equipment: [equipment("tank", "tank", [-4, 0, 0]), equipment("valve", "valve", [0, 1, 0]), equipment("pump", "pump", [4, 0, 0])], connections: [
    { id: "feed-in", from: { nodeId: "tank", portId: "outlet" }, to: { nodeId: "valve", portId: "inlet" }, elevation: 2.5, lane: 3 },
    { id: "feed-out", from: { nodeId: "valve", portId: "outlet" }, to: { nodeId: "pump", portId: "inlet" }, elevation: 2.8, lane: 3 },
  ] },
  { id: "treatment", name: "熱交換・分離ユニット", equipment: [equipment("exchanger", "hx", [-3, 0, 0]), equipment("tower", "tower", [3, 0, 0])], connections: [
    { id: "process", from: { nodeId: "hx", portId: "outlet" }, to: { nodeId: "tower", portId: "inlet" }, elevation: 3, lane: 3 },
  ] },
  { id: "storage", name: "貯槽ユニット", equipment: [equipment("tank", "tank", [0, 0, 0])], connections: [] },
  { id: "power", name: "動力盤ユニット", equipment: [{ id: "mcc", tag: "MCC", name: "動力盤", kind: "component", position: [0, 0, 0], size: [2, 2.4, 0.9], properties: { 電源: "400 V / サンプル" } }], connections: [] },
]

export const DEFAULT_PLANT_DESIGN: PlantDesign = {
  schemaVersion: 1, id: "modular-demo", name: "モジュール式プラント / 概念設計", revision: 1,
  site: { boundary: rectangle(-30, -20, 30, 20), exclusions: [{ id: "access", name: "搬入道路", polygon: rectangle(-30, 14, 30, 20) }], clearance: 1.5 },
  modules: DESIGN_MODULES,
  units: [
    { id: "feed1", moduleId: "feed", name: "移送 A", position: [-16, 0, -6], rotation: 0 },
    { id: "process1", moduleId: "treatment", name: "分離 A", position: [2, 0, -6], rotation: 0 },
    { id: "storage1", moduleId: "storage", name: "製品槽 A", position: [18, 0, -6], rotation: 0 },
    { id: "power1", moduleId: "power", name: "動力盤 A", position: [-16, 0, 7], rotation: 0 },
  ],
  connections: [
    { id: "feed-process", from: { unitId: "feed1", nodeId: "pump", portId: "outlet" }, to: { unitId: "process1", nodeId: "hx", portId: "inlet" }, elevation: 3.5, lane: 1 },
    { id: "process-product", from: { unitId: "process1", nodeId: "tower", portId: "outlet" }, to: { unitId: "storage1", nodeId: "tank", portId: "inlet" }, elevation: 4, lane: 2 },
    { id: "motor-power", from: { unitId: "power1", nodeId: "mcc", portId: "power" }, to: { unitId: "feed1", nodeId: "pump", portId: "power" }, elevation: 4.5, lane: 10 },
  ],
}