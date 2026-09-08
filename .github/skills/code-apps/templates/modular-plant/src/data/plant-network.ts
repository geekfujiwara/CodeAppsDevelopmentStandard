import type { PlantNode, PlantPoint, PlantRoute, PlantTerminal } from "./plant-model.ts"

export type PlantPort = { id: string; position: PlantPoint; direction: PlantPoint; medium: PlantRoute["medium"] }
const NOZZLE_LENGTH = 0.35
const TOLERANCE = 0.00001

export function equipmentPorts(node: PlantNode): PlantPort[] {
  const [width, height, depth] = node.size
  const ports: PlantPort[] = []
  const add = (id: string, surface: PlantPoint, direction: PlantPoint, medium: PlantRoute["medium"] = "process") => {
    ports.push({ id, position: surface.map((value, axis) => value + direction[axis] * NOZZLE_LENGTH) as PlantPoint, direction, medium })
  }
  if (node.kind === "tank" || node.kind === "tower") {
    add("inlet", [-width / 2, 1, 0], [-1, 0, 0])
    add("outlet", [width / 2, 1, 0], [1, 0, 0])
  } else if (node.kind === "pump") {
    add("inlet", [-width * 0.41, 0.8, 0], [-1, 0, 0])
    add("outlet", [-width * 0.3, 1.475, 0], [0, 1, 0])
    add("power", [width * 0.17, 0.8, height * 0.32], [0, 0, 1], "power")
  } else if (node.kind === "exchanger" || node.kind === "valve") {
    const center = node.kind === "exchanger" ? height * 0.65 : 0
    add("inlet", [-width / 2, center, 0], [-1, 0, 0])
    add("outlet", [width / 2, center, 0], [1, 0, 0])
  } else if (node.kind === "component") {
    add("power", [0, height / 2, depth / 2], [0, 0, 1], "power")
  }
  return ports
}

export function terminalPosition(nodes: PlantNode[], terminal: PlantTerminal): PlantPoint {
  const node = nodes.find((candidate) => candidate.id === terminal.nodeId)
  const port = node && equipmentPorts(node).find((candidate) => candidate.id === terminal.portId)
  if (!node || !port) throw new Error(`Unknown terminal: ${terminal.nodeId}:${terminal.portId}`)
  return orientedPoint(port.position, node.rotation ?? 0).map((value, axis) => value + node.position[axis]) as PlantPoint
}

function orientedPoint(point: PlantPoint, rotation: number): PlantPoint {
  const angle = rotation * Math.PI / 180
  return [point[0] * Math.cos(angle) + point[2] * Math.sin(angle), point[1], -point[0] * Math.sin(angle) + point[2] * Math.cos(angle)]
}

export function routedConnection(nodes: PlantNode[], id: string, from: PlantTerminal, to: PlantTerminal, elevation: number, lane: number): PlantNode {
  const source = nodes.find((node) => node.id === from.nodeId)!
  const target = nodes.find((node) => node.id === to.nodeId)!
  const start = terminalPosition(nodes, from)
  const end = terminalPosition(nodes, to)
  const sourcePort = equipmentPorts(source).find((port) => port.id === from.portId)!
  const targetPort = equipmentPorts(target).find((port) => port.id === to.portId)!
  if (sourcePort.medium !== targetPort.medium) throw new Error(`Incompatible terminals: ${id}`)
  const escape = (point: PlantPoint, direction: PlantPoint): PlantPoint => point.map((value, axis) => value + direction[axis] * 0.7) as PlantPoint
  const startEscape = escape(start, orientedPoint(sourcePort.direction, source.rotation ?? 0))
  const endEscape = escape(end, orientedPoint(targetPort.direction, target.rotation ?? 0))
  const points: PlantPoint[] = [start, startEscape, [startEscape[0], elevation, startEscape[2]], [startEscape[0], elevation, lane], [endEscape[0], elevation, lane], [endEscape[0], elevation, endEscape[2]], endEscape, end]
  const medium = sourcePort.medium
  const route: PlantRoute = { from, to, medium, radius: medium === "power" ? 0.055 : 0.12, points: points.filter((point, index) => index === 0 || Math.hypot(...point.map((value, axis) => value - points[index - 1][axis])) > TOLERANCE) }
  return { id, tag: id.toUpperCase(), name: `${source.tag} → ${target.tag} ${medium === "power" ? "電源ケーブル" : "接続配管"}`, area: medium === "power" ? "電気設備" : source.area, kind: "pipe", position: [0, 0, 0], size: [1, route.radius, route.radius], route,
    properties: { 接続元: `${source.tag}:${from.portId}`, 接続先: `${target.tag}:${to.portId}`, 系統: medium === "power" ? "動力" : "プロセス", 接続: "接続口座標に一致" }, documentIds: [] }
}

export function validatePlantConnections(nodes: PlantNode[]) {
  const issues: string[] = []
  const distance = (left: PlantPoint, right: PlantPoint) => Math.hypot(...left.map((value, axis) => value - right[axis]))
  for (const node of nodes) {
    if (node.kind === "pipe" && !node.route) issues.push(`${node.id}: missing route`)
    if (!node.route) continue
    const { route } = node
    if (route.points.length < 2 || !Number.isFinite(route.radius) || route.radius <= 0) issues.push(`${node.id}: invalid route`)
    for (const [index, terminal] of [route.from, route.to].entries()) {
      try {
        const expected = terminalPosition(nodes, terminal)
        const point = route.points[index === 0 ? 0 : route.points.length - 1]
        const actual = point?.map((value, axis) => value + node.position[axis]) as PlantPoint | undefined
        if (!actual || distance(actual, expected) > TOLERANCE) issues.push(`${node.id}: disconnected ${terminal.nodeId}:${terminal.portId}`)
        const target = nodes.find((candidate) => candidate.id === terminal.nodeId)!
        if (equipmentPorts(target).find((port) => port.id === terminal.portId)?.medium !== route.medium) issues.push(`${node.id}: incompatible medium`)
      } catch { issues.push(`${node.id}: unknown terminal`) }
    }
    route.points.forEach((point, index) => {
      if (!point.every(Number.isFinite)) issues.push(`${node.id}: nonfinite point`)
      if (index && distance(point, route.points[index - 1]) < TOLERANCE) issues.push(`${node.id}: zero length segment`)
    })
  }
  return issues
}