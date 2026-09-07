import type { ValidateFunction } from "ajv"
import clipping from "polygon-clipping"
import kinks from "@turf/kinks"
import { polygon } from "@turf/helpers"
import validate from "./plant-design-validator.js"
import { routedConnection, validatePlantConnections } from "./plant-network.ts"
import type { PlantNode, PlantPoint, PlantTerminal } from "./plant-model.ts"

export type Ring = [number, number][]
export type ModuleEquipment = Pick<PlantNode, "id" | "tag" | "name" | "kind" | "position" | "size" | "properties">
export type DesignConnection = { id: string; from: PlantTerminal; to: PlantTerminal; elevation: number; lane: number }
export type UnitTerminal = PlantTerminal & { unitId: string }
export type PlantModule = { id: string; name: string; equipment: ModuleEquipment[]; connections: DesignConnection[] }
export type PlantUnit = { id: string; moduleId: string; name: string; position: PlantPoint; rotation: 0 | 90 | 180 | 270 }
export type PlantDesign = {
  schemaVersion: 1; id: string; name: string; revision: number;
  site: { boundary: Ring; exclusions: { id: string; name: string; polygon: Ring }[]; clearance: number };
  modules: PlantModule[]; units: PlantUnit[];
  connections: (Omit<DesignConnection, "from" | "to"> & { from: UnitTerminal; to: UnitTerminal })[];
}
export type DesignIssue = { code: string; message: string; unitId?: string }
const schemaValidator = validate as ValidateFunction<PlantDesign>
export const MAX_DESIGN_BYTES = 500000

export function parsePlantDesign(json: string): PlantDesign {
  if (new TextEncoder().encode(json).length > MAX_DESIGN_BYTES) throw new Error("設計 JSON は 500 KB 以下にしてください。")
  const value: unknown = JSON.parse(json)
  if (!schemaValidator(value)) throw new Error(schemaValidator.errors?.slice(0, 5).map((error) => `${error.instancePath || "/"}: ${error.message}`).join("\n"))
  if (value.units.reduce((count, unit) => count + (value.modules.find((module) => module.id === unit.moduleId)?.equipment.length ?? 0), 0) > 300) throw new Error("設備は合計 300 台以下にしてください。")
  return value
}

export function rotatePoint(point: PlantPoint, rotation: number): PlantPoint {
  const angle = rotation * Math.PI / 180
  return [point[0] * Math.cos(angle) + point[2] * Math.sin(angle), point[1], -point[0] * Math.sin(angle) + point[2] * Math.cos(angle)]
}

export function moduleNodes(module: PlantModule): PlantNode[] {
  const nodes: PlantNode[] = module.equipment.map((node) => ({ ...node, area: module.name, documentIds: [] }))
  for (const connection of module.connections) nodes.push(routedConnection(nodes, connection.id, connection.from, connection.to, connection.elevation, connection.lane))
  return nodes
}

export function compilePlantDesign(design: PlantDesign): PlantNode[] {
  const nodes: PlantNode[] = []
  for (const unit of design.units) {
    const module = design.modules.find((candidate) => candidate.id === unit.moduleId)
    if (!module) throw new Error(`ユニット ${unit.id}: モジュール ${unit.moduleId} がありません。`)
    const transform = (point: PlantPoint) => rotatePoint(point, unit.rotation).map((value, axis) => value + unit.position[axis]) as PlantPoint
    for (const node of moduleNodes(module)) {
      nodes.push({ ...node, id: `${unit.id}/${node.id}`, tag: `${unit.id}:${node.tag}`, area: unit.name,
        position: node.route ? [0, 0, 0] : transform(node.position), rotation: node.route ? 0 : unit.rotation,
        ...(node.route ? { route: { ...node.route, points: node.route.points.map(transform), from: { ...node.route.from, nodeId: `${unit.id}/${node.route.from.nodeId}` }, to: { ...node.route.to, nodeId: `${unit.id}/${node.route.to.nodeId}` } } } : {}),
      })
    }
  }
  for (const connection of design.connections) nodes.push(routedConnection(nodes, `link/${connection.id}`, { nodeId: `${connection.from.unitId}/${connection.from.nodeId}`, portId: connection.from.portId }, { nodeId: `${connection.to.unitId}/${connection.to.nodeId}`, portId: connection.to.portId }, connection.elevation, connection.lane))
  return nodes
}

export function rectangle(minX: number, minZ: number, maxX: number, maxZ: number): Ring {
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ]]
}

export function unitFootprint(design: PlantDesign, unit: PlantUnit): Ring {
  const module = design.modules.find((candidate) => candidate.id === unit.moduleId)
  if (!module) throw new Error(`Unknown module: ${unit.moduleId}`)
  const points: PlantPoint[] = []
  for (const node of moduleNodes(module)) {
    if (node.route) points.push(...node.route.points)
    else for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) points.push([node.position[0] + sideX * (node.size[0] / 2 + 0.7), 0, node.position[2] + sideZ * (node.size[2] / 2 + 0.7)])
  }
  const world = points.map((point) => rotatePoint(point, unit.rotation).map((value, axis) => value + unit.position[axis]))
  const margin = design.site.clearance / 2 + 0.15
  return rectangle(Math.min(...world.map((point) => point[0])) - margin, Math.min(...world.map((point) => point[2])) - margin, Math.max(...world.map((point) => point[0])) + margin, Math.max(...world.map((point) => point[2])) + margin)
}

export function validRing(ring: Ring) {
  if (ring.length < 4 || ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) return false
  if (new Set(ring.slice(0, -1).map((point) => point.join(","))).size !== ring.length - 1) return false
  try { return kinks(polygon([ring])).features.length === 0 && clipping.union([ring]).length > 0 } catch { return false }
}

export function validatePlantDesign(design: PlantDesign): DesignIssue[] {
  const issues: DesignIssue[] = []
  const add = (code: string, message: string, unitId?: string) => issues.push({ code, message, unitId })
  const unique = (ids: string[], scope: string) => { if (new Set(ids).size !== ids.length) add("duplicate", `${scope}: ID が重複しています。`) }
  unique(design.modules.map((module) => module.id), "modules")
  unique(design.units.map((unit) => unit.id), "units")
  unique(design.connections.map((connection) => connection.id), "connections")
  unique(design.site.exclusions.map((zone) => zone.id), "exclusions")
  for (const module of design.modules) unique([...module.equipment, ...module.connections].map((node) => node.id), module.id)
  if (!validRing(design.site.boundary)) add("site", "敷地境界は自己交差のない閉じたポリゴンにしてください。")
  for (const zone of design.site.exclusions) if (!validRing(zone.polygon)) add("site", `${zone.name}: 禁止区域の形状が不正です。`)
  if (issues.length) return issues
  let nodes: PlantNode[]
  try { nodes = compilePlantDesign(design) } catch (error) { add("reference", error instanceof Error ? error.message : "参照が不正です。"); return issues }
  for (const message of validatePlantConnections(nodes)) add("connection", message)
  const occupied: { unit: PlantUnit; ring: Ring }[] = []
  for (const unit of design.units) {
    const footprint = unitFootprint(design, unit)
    if (clipping.difference([footprint], [design.site.boundary]).length) add("outside", `${unit.name}: 敷地境界または余白を超えています。`, unit.id)
    for (const zone of design.site.exclusions) if (clipping.intersection([footprint], [zone.polygon]).length) add("exclusion", `${unit.name}: ${zone.name} に重なっています。`, unit.id)
    for (const previous of occupied) if (clipping.intersection([footprint], [previous.ring]).length) add("overlap", `${unit.name}: ${previous.unit.name} と配置範囲が重なっています。`, unit.id)
    occupied.push({ unit, ring: footprint })
  }
  for (const node of nodes.filter((candidate) => candidate.id.startsWith("link/") && candidate.route)) {
    const route = node.route!
    for (let index = 1; index < route.points.length; index++) {
      const start = route.points[index - 1], end = route.points[index]
      const ring = rectangle(Math.min(start[0], end[0]) - route.radius, Math.min(start[2], end[2]) - route.radius, Math.max(start[0], end[0]) + route.radius, Math.max(start[2], end[2]) + route.radius)
      if (clipping.difference([ring], [design.site.boundary]).length || design.site.exclusions.some((zone) => clipping.intersection([ring], [zone.polygon]).length)) { add("route-site", `${node.tag}: 配管・配線が敷地外または禁止区域を通過します。`); break }
    }
  }
  return issues
}

export function assertPlantDesign(json: string) {
  const design = parsePlantDesign(json)
  const issues = validatePlantDesign(design)
  if (issues.length) throw new Error(issues.slice(0, 12).map((issue) => issue.message).join("\n"))
  return design
}

export function removeUnit(design: PlantDesign, unitId: string): PlantDesign {
  return { ...design, units: design.units.filter((unit) => unit.id !== unitId), connections: design.connections.filter((connection) => connection.from.unitId !== unitId && connection.to.unitId !== unitId) }
}

export function designDiff(before: PlantDesign, after: PlantDesign): string[] {
  const changes: string[] = []
  for (const key of ["site", "modules", "connections", "name"] as const) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes.push(`${key} を変更`)
  for (const unit of before.units) {
    const next = after.units.find((candidate) => candidate.id === unit.id)
    if (!next) changes.push(`${unit.name} を削除`)
    else if (JSON.stringify(unit) !== JSON.stringify(next)) changes.push(`${unit.name}: (${unit.position.join(", ")}) / ${unit.rotation}° → (${next.position.join(", ")}) / ${next.rotation}°`)
  }
  for (const unit of after.units) if (!before.units.some((candidate) => candidate.id === unit.id)) changes.push(`${unit.name} を追加`)
  return changes
}