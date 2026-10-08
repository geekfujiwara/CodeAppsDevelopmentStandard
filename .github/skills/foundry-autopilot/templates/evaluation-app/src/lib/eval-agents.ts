import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num, quote } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const EVAL_AGENT_ENTITY_SET = `${p}_evalagents`

export const EVAL_AGENTS_KEY = ["eval-agents"]

export const AF = {
  id: `${p}_evalagentid`,
  name: `${p}_name`,
  agentKey: `${p}_agentkey`,
  role: `${p}_role`,
  description: `${p}_description`,
  managerKey: `${p}_managerkey`,
  upn: `${p}_upn`,
  agenticUserId: `${p}_agenticuserid`,
  webAppName: `${p}_webappname`,
  endpoint: `${p}_endpoint`,
  photoUrl: `${p}_photourl`,
  skills: `${p}_skills`,
  status: `${p}_status`,
  sortOrder: `${p}_sortorder`,
} as const

export const STATUS_ACTIVE = 1
export const STATUS_STOPPED = 2
export const STATUS_BUILDING = 3
export const STATUS_RETIRED = 4

export const STATUS_OPTIONS = [
  { value: STATUS_ACTIVE, label: "稼働中" },
  { value: STATUS_STOPPED, label: "停止中" },
  { value: STATUS_BUILDING, label: "構築中" },
  { value: STATUS_RETIRED, label: "廃止" },
] as const

export function statusLabel(value: number | null): string {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "不明"
}

export type EvalAgent = {
  id: string
  name: string
  agentKey: string
  role: string
  description: string
  managerKey: string
  upn: string
  agenticUserId: string
  webAppName: string
  endpoint: string
  photoUrl: string
  skills: string[]
  status: number | null
  sortOrder: number | null
  /** ListTable の絞り込み用 */
  statusLabel: string
}

function toSkills(raw: string): string[] {
  if (!raw.trim()) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => (typeof entry === "string" ? entry : String(entry)))
    }
  } catch {
    // The agent writes its skill folder names as a plain comma list when it has no JSON to hand.
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toEvalAgent(row: DataverseRow): EvalAgent {
  const status = num(row, AF.status)
  return {
    id: str(row, AF.id),
    name: str(row, AF.name),
    agentKey: str(row, AF.agentKey),
    role: str(row, AF.role),
    description: str(row, AF.description),
    managerKey: str(row, AF.managerKey),
    upn: str(row, AF.upn),
    agenticUserId: str(row, AF.agenticUserId),
    webAppName: str(row, AF.webAppName),
    endpoint: str(row, AF.endpoint),
    photoUrl: str(row, AF.photoUrl),
    skills: toSkills(str(row, AF.skills)),
    status,
    sortOrder: num(row, AF.sortOrder),
    statusLabel: statusLabel(status),
  }
}

export async function listEvalAgents(): Promise<EvalAgent[]> {
  const rows = await DataverseService.ListRecords(EVAL_AGENT_ENTITY_SET, {
    select: Object.values(AF),
    orderBy: `${AF.sortOrder} asc`,
    top: 500,
  })
  return rows.map(toEvalAgent)
}

export async function getEvalAgent(id: string): Promise<EvalAgent> {
  const row = await DataverseService.GetItem(EVAL_AGENT_ENTITY_SET, id, Object.values(AF))
  return toEvalAgent(row)
}

export async function findEvalAgentByKey(agentKey: string): Promise<EvalAgent | null> {
  if (!agentKey) return null
  const rows = await DataverseService.ListRecords(EVAL_AGENT_ENTITY_SET, {
    select: Object.values(AF),
    filter: `${AF.agentKey} eq '${quote(agentKey)}'`,
    top: 1,
  })
  return rows.length > 0 ? toEvalAgent(rows[0]) : null
}

export type EvalAgentInput = {
  name: string
  agentKey: string
  role: string
  description: string
  managerKey: string
  upn: string
  status: number
  sortOrder: number
}

export async function createEvalAgent(input: EvalAgentInput): Promise<void> {
  await DataverseService.CreateRecord(EVAL_AGENT_ENTITY_SET, {
    [AF.name]: input.name,
    [AF.agentKey]: input.agentKey,
    [AF.role]: input.role,
    [AF.description]: input.description,
    [AF.managerKey]: input.managerKey,
    [AF.upn]: input.upn,
    [AF.status]: input.status,
    [AF.sortOrder]: input.sortOrder,
  })
}

export async function updateEvalAgent(id: string, input: EvalAgentInput): Promise<void> {
  await DataverseService.UpdateRecord(EVAL_AGENT_ENTITY_SET, id, {
    [AF.name]: input.name,
    [AF.agentKey]: input.agentKey,
    [AF.role]: input.role,
    [AF.description]: input.description,
    [AF.managerKey]: input.managerKey,
    [AF.upn]: input.upn,
    [AF.status]: input.status,
    [AF.sortOrder]: input.sortOrder,
  })
}

export type OrgNode = {
  agent: EvalAgent
  reports: OrgNode[]
}

/**
 * Builds the reporting tree. Agents whose manager is missing, retired, or forms a cycle are
 * returned as roots rather than dropped: an org chart that silently hides a teammate is worse
 * than one that shows an unexpected top-level box.
 */
export function buildOrgTree(agents: EvalAgent[]): OrgNode[] {
  const nodes = new Map<string, OrgNode>()
  for (const agent of agents) {
    if (agent.agentKey) nodes.set(agent.agentKey, { agent, reports: [] })
  }

  const roots: OrgNode[] = []
  for (const node of nodes.values()) {
    const parent = nodes.get(node.agent.managerKey)
    if (!parent || parent === node || descendsFrom(parent, node, nodes)) {
      roots.push(node)
      continue
    }
    parent.reports.push(node)
  }

  const bySort = (a: OrgNode, b: OrgNode) =>
    (a.agent.sortOrder ?? 0) - (b.agent.sortOrder ?? 0) || a.agent.name.localeCompare(b.agent.name)
  const sortDeep = (list: OrgNode[]) => {
    list.sort(bySort)
    for (const node of list) sortDeep(node.reports)
  }
  sortDeep(roots)
  return roots
}

function descendsFrom(candidate: OrgNode, ancestor: OrgNode, nodes: Map<string, OrgNode>): boolean {
  const seen = new Set<string>()
  let current: OrgNode | undefined = candidate
  while (current) {
    if (current === ancestor) return true
    if (seen.has(current.agent.agentKey)) return true
    seen.add(current.agent.agentKey)
    current = nodes.get(current.agent.managerKey)
  }
  return false
}
