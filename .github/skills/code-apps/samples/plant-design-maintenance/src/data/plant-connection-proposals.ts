import { compilePlantDesign, parsePlantDesign, validatePlantDesign, type PlantDesign, type UnitTerminal } from "./plant-design.ts"
import { equipmentPorts, terminalPosition } from "./plant-network.ts"
import type { PlantNode, PlantPoint } from "./plant-model.ts"

export type ConnectionProposal = {
  key: string
  connection: PlantDesign["connections"][number]
  medium: "process" | "power"
  fromLabel: string
  toLabel: string
  distance: number
}
export type ConnectionProposals = { basis: string; unitId: string; proposals: ConnectionProposal[]; reason: string }
type Endpoint = { terminal: UnitTerminal; node: PlantNode; portId: string; medium: "process" | "power"; position: PlantPoint }
const endpointKey = (terminal: UnitTerminal) => JSON.stringify([terminal.unitId, terminal.nodeId, terminal.portId])

export function proposePlantConnections(design: PlantDesign, unitId: string): ConnectionProposals {
  const result: ConnectionProposals = { basis: JSON.stringify(design), unitId, proposals: [], reason: "互換性のある未接続端点が30 m以内にありません。" }
  if (!design.units.some((unit) => unit.id === unitId)) return { ...result, reason: "配置ユニットがありません。" }
  if (design.connections.length >= 100) return { ...result, reason: "接続数の上限に達しています。" }
  try {
    parsePlantDesign(result.basis)
    if (validatePlantDesign(design).length) return { ...result, reason: "配置・接続の要確認項目を解消すると候補を更新できます。" }
    const nodes = compilePlantDesign(design)
    const occupied = new Set<string>()
    for (const node of nodes) if (node.route) for (const terminal of [node.route.from, node.route.to]) occupied.add(JSON.stringify([terminal.nodeId, terminal.portId]))
    const endpoints: Endpoint[] = []
    for (const unit of design.units) {
      const module = design.modules.find((item) => item.id === unit.moduleId)!
      for (const equipment of module.equipment) {
        const node = nodes.find((item) => item.id === `${unit.id}/${equipment.id}`)!
        for (const port of equipmentPorts(node)) {
          if (occupied.has(JSON.stringify([node.id, port.id]))) continue
          endpoints.push({ terminal: { unitId: unit.id, nodeId: equipment.id, portId: port.id }, node, portId: port.id, medium: port.medium, position: terminalPosition(nodes, { nodeId: node.id, portId: port.id }) })
        }
      }
    }
    const candidates: { from: Endpoint; to: Endpoint; distance: number }[] = []
    const sources = endpoints.filter((endpoint) => endpoint.portId === "outlet" || (endpoint.medium === "power" && endpoint.node.kind === "component"))
    const targets = endpoints.filter((endpoint) => endpoint.portId === "inlet" || (endpoint.medium === "power" && endpoint.node.kind === "pump"))
    for (const source of sources) for (const target of targets) {
      if (source.terminal.unitId === target.terminal.unitId || (source.terminal.unitId !== unitId && target.terminal.unitId !== unitId) || source.medium !== target.medium) continue
      const distance = Math.hypot(...source.position.map((value, axis) => value - target.position[axis]))
      if (distance > 0 && distance <= 30) candidates.push({ from: source, to: target, distance })
    }
    candidates.sort((left, right) => left.distance - right.distance || endpointKey(left.from.terminal).localeCompare(endpointKey(right.from.terminal)) || endpointKey(left.to.terminal).localeCompare(endpointKey(right.to.terminal)))
    for (const candidate of candidates.slice(0, 30)) {
      const { from, to, distance } = candidate
      let suffix = 1
      while (design.connections.some((connection) => connection.id === `auto-${suffix}`)) suffix++
      const elevation = Math.min(50, Math.max(4, from.position[1] + 1, to.position[1] + 1))
      const lanes = [...new Set([(from.position[2] + to.position[2]) / 2, from.position[2], to.position[2]])]
      for (const lane of lanes) {
        const connection = { id: `auto-${suffix}`, from: from.terminal, to: to.terminal, elevation, lane }
        const next = { ...design, connections: [...design.connections, connection] }
        if (validatePlantDesign(next).length) continue
        result.proposals.push({ key: JSON.stringify([from.terminal, to.terminal]), connection, medium: from.medium, fromLabel: `${from.node.tag} / ${from.portId}`, toLabel: `${to.node.tag} / ${to.portId}`, distance })
        break
      }
      if (result.proposals.length >= 5) break
    }
    if (result.proposals.length) result.reason = ""
    else if (candidates.length) result.reason = "敷地・禁止区域の条件を満たす接続経路がありません。"
    return result
  } catch {
    return { ...result, reason: "設計データを確認できません。配置・接続を確認してください。" }
  }
}

export function acceptPlantConnection(design: PlantDesign, batch: ConnectionProposals, key: string): PlantDesign {
  if (JSON.stringify(design) !== batch.basis) throw new Error("設計が変更されています。接続候補を更新してください。")
  const proposal = proposePlantConnections(design, batch.unitId).proposals.find((candidate) => candidate.key === key)
  if (!proposal) throw new Error("接続候補は現在の設計に適用できません。")
  const next = { ...design, connections: [...design.connections, proposal.connection] }
  parsePlantDesign(JSON.stringify(next))
  if (validatePlantDesign(next).length) throw new Error("接続経路が設計条件を満たしていません。")
  return next
}