// プラント設計画面から Copilot Studio エージェントへ渡す文脈と、エージェントが返す配置 JSON の取り込みを扱う。
// UI から独立した純粋関数だけを置き、node --test から直接検証できるようにする。
import { assertPlantDesign, MAX_DESIGN_BYTES, parsePlantDesign, rectangle, validatePlantDesign, type DesignIssue, type PlantDesign, type Ring } from "../data/plant-design.ts"
import { equipmentPorts } from "../data/plant-network.ts"
import type { PlantNode } from "../data/plant-model.ts"

export type DesignBrief = {
  siteName: string
  siteWidth: number
  siteDepth: number
  clearance: number
  access: string
  exclusions: string
  regulations: string
  goal: string
  capacity: string
  priorities: string
}

export const EMPTY_DESIGN_BRIEF: DesignBrief = {
  siteName: "", siteWidth: 60, siteDepth: 40, clearance: 1.5,
  access: "", exclusions: "", regulations: "", goal: "", capacity: "", priorities: "",
}

export const DESIGN_WIZARD_STEPS = [
  { key: "site", title: "敷地の概要", hint: "設計対象の土地の広さと出入り口を入力します。" },
  { key: "limits", title: "制約", hint: "使えない区域と法規・安全上の条件を入力します。" },
  { key: "goal", title: "設計ゴール", hint: "つくりたいプラントと重視する点を入力します。" },
  { key: "generate", title: "AI と設計", hint: "AI アシスタントに配置案を JSON で作らせ、内容を確認して反映します。" },
] as const

const SITE_LIMIT = { min: 10, max: 400 }

export function validateDesignBrief(brief: DesignBrief): string[] {
  const errors: string[] = []
  if (![brief.siteWidth, brief.siteDepth].every((value) => Number.isFinite(value) && value >= SITE_LIMIT.min && value <= SITE_LIMIT.max)) errors.push("敷地の広さは 10〜400 m の数値で入力してください。")
  if (!Number.isFinite(brief.clearance) || brief.clearance < 0 || brief.clearance > 10) errors.push("余白は 0〜10 m の数値で入力してください。")
  return errors
}

export function initialDesignBrief(design: PlantDesign): DesignBrief {
  const horizontal = design.site.boundary.map((point) => point[0])
  const vertical = design.site.boundary.map((point) => point[1])
  return { ...EMPTY_DESIGN_BRIEF, siteName: design.name, siteWidth: Math.max(...horizontal) - Math.min(...horizontal), siteDepth: Math.max(...vertical) - Math.min(...vertical), clearance: design.site.clearance }
}

export function briefBoundary(brief: DesignBrief): Ring {
  const errors = validateDesignBrief(brief)
  if (errors.length) throw new Error(errors.join("\n"))
  const width = brief.siteWidth
  const depth = brief.siteDepth
  return rectangle(-width / 2, -depth / 2, width / 2, depth / 2)
}

export function briefClearance(brief: DesignBrief) {
  const errors = validateDesignBrief(brief)
  if (errors.length) throw new Error(errors.join("\n"))
  return brief.clearance
}

export function requestedDesignSite(design: PlantDesign, brief: DesignBrief): PlantDesign["site"] {
  const rectangleBoundary = briefBoundary(brief)
  const initial = initialDesignBrief(design)
  return { ...design.site, boundary: brief.siteWidth === initial.siteWidth && brief.siteDepth === initial.siteDepth ? design.site.boundary : rectangleBoundary, clearance: briefClearance(brief) }
}

export function moduleCatalog(design: PlantDesign) {
  return design.modules.map((module) => {
    const horizontal = module.equipment.flatMap((node) => [node.position[0] - node.size[0] / 2, node.position[0] + node.size[0] / 2])
    const vertical = module.equipment.flatMap((node) => [node.position[2] - node.size[2] / 2, node.position[2] + node.size[2] / 2])
    const span = (values: number[]) => values.length ? Number((Math.max(...values) - Math.min(...values) + 1.4).toFixed(1)) : 0
    return {
      moduleId: module.id,
      name: module.name,
      sizeX: span(horizontal),
      sizeZ: span(vertical),
      equipment: module.equipment.map((node) => ({
        nodeId: node.id,
        name: node.name,
        kind: node.kind,
        ports: equipmentPorts({ ...node, area: module.name, documentIds: [] } as PlantNode).map((port) => `${port.id}:${port.medium}`),
      })),
    }
  })
}

export function buildDesignPrompt(design: PlantDesign, brief: DesignBrief): string {
  const site = requestedDesignSite(design, brief)
  const boundary = site.boundary
  const width = brief.siteWidth
  const depth = brief.siteDepth
  return [
    "あなたはプラントの概念設計を担当する設計者です。次の条件に合わせてモジュールを敷地へ配置し、指定した JSON だけを出力してください。",
    "",
    "# 敷地",
    `- 名称: ${brief.siteName.trim() || "未設定"}`,
    `- 広さ: X 方向 ${width} m / Z 方向 ${depth} m（座標は敷地中心を原点とする m 単位）`,
    `- site.boundary には ${JSON.stringify(boundary)} をそのまま使う`,
    `- ユニット間の最小余白: ${briefClearance(brief)} m`,
    `- 搬入・アクセス・方位: ${brief.access.trim() || "指定なし"}`,
    "",
    "# 制約",
    `- 使用できない区域: ${brief.exclusions.trim() || "指定なし"}`,
    `- 法規・安全上の条件: ${brief.regulations.trim() || "指定なし"}`,
    "- 既存の禁止区域は削除・変更しない。追加条件のみ polygon として追加する。",
    "```json",
    JSON.stringify(site.exclusions).replaceAll("`", "\\u0060"),
    "```",
    "",
    "# 設計ゴール",
    `- つくりたいプラント: ${brief.goal.trim() || "指定なし"}`,
    `- 規模・処理量: ${brief.capacity.trim() || "指定なし"}`,
    `- 重視する点: ${brief.priorities.trim() || "指定なし"}`,
    "",
    "# 使えるモジュール（moduleId・nodeId・portId は必ずこの一覧から選ぶ）",
    "```json",
    JSON.stringify(moduleCatalog(design)).replaceAll("`", "\\u0060"),
    "```",
    "",
    "# 出力の決まり",
    "- 説明文を付けず、次の形の JSON オブジェクトだけを json コードブロックで出力する。",
    "- modules は出力しない。既存モジュールの寸法・内部接続を変更しない。法規・処理能力は自動検証していないため適合を保証しない。",
    "- position は [x, 0, z] の 3 要素、rotation は 0 / 90 / 180 / 270 のいずれか。",
    "- units の id と connections の id は英数字とハイフンだけで、それぞれ一意にする。units は 2 件以上 30 件以下。",
    "- 各ユニットが占める矩形（sizeX / sizeZ に余白を加えた範囲）を敷地内に収め、ユニットどうし・禁止区域と重ならないように離して置く。",
    "- exclusions の polygon は [[x,z], ...] の閉じた多角形（先頭と末尾が同じ点）にする。既存区域も追加条件も無い場合だけ空配列にする。",
    "- connections の elevation は 3〜6 の数値、lane は 0〜15 の整数。異なる系統には別の lane を割り当てる。",
    "- 動力盤ユニットの power ポートは、ポンプなど power ポートを持つ設備とだけ接続する。",
    "```json",
    JSON.stringify({ name: design.name, site, units: design.units, connections: design.connections, notes: "配置の意図を 200 文字以内で説明" }).replaceAll("`", "\\u0060"),
    "```",
  ].join("\n")
}

function balancedObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index++) {
    const character = text[index]
    if (escaped) { escaped = false; continue }
    if (character === "\\") { if (quoted) escaped = true; continue }
    if (character === '"') { quoted = !quoted; continue }
    if (quoted) continue
    if (character === "{") depth++
    else if (character === "}" && --depth === 0) return text.slice(start, index + 1)
  }
  return null
}

export function extractJsonObject(text: string): string {
  if (new TextEncoder().encode(text).length > MAX_DESIGN_BYTES) throw new Error("応答は 500 KB 以下にしてください。")
  const objects: string[] = []
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const found = balancedObject(match[1])
    if (found) {
      if (match[1].trim() !== found) throw new Error("JSON ブロックには単一のオブジェクトを指定してください。")
      objects.push(found)
    }
  }
  if (objects.length > 1) throw new Error("配置案が複数あります。単一の JSON を返してください。")
  if (objects.length === 1) return objects[0]
  const found = balancedObject(text)
  if (!found) throw new Error("応答に JSON が含まれていません。もう一度生成してください。")
  if (balancedObject(text.slice(text.indexOf(found) + found.length))) throw new Error("配置案が複数あります。単一の JSON を返してください。")
  return found
}

export type DesignPlanResult = { design: PlantDesign; issues: DesignIssue[]; notes: string }

// エージェントの応答から配置案を取り出し、編集中のモジュール定義と合成して検証する。
export function applyDesignPlan(design: PlantDesign, reply: string, brief?: DesignBrief): DesignPlanResult {
  const parsed: unknown = JSON.parse(extractJsonObject(reply))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON オブジェクトを取得できませんでした。")
  const envelope = parsed as Record<string, unknown>
  const plan = (envelope.design && typeof envelope.design === "object" && !Array.isArray(envelope.design) ? envelope.design : envelope) as Record<string, unknown>
  if (!Array.isArray(plan.units) || !plan.units.length) throw new Error("units が空です。条件を補足してもう一度生成してください。")
  if (plan.modules !== undefined && JSON.stringify(plan.modules) !== JSON.stringify(design.modules)) throw new Error("既存モジュールの変更は許可されていません。")
  const merged = {
    ...design,
    schemaVersion: 1,
    id: design.id,
    revision: design.revision,
    name: typeof plan.name === "string" && plan.name.trim() ? plan.name.trim().slice(0, 200) : design.name,
    site: plan.site && typeof plan.site === "object" && !Array.isArray(plan.site) ? plan.site : design.site,
    modules: design.modules,
    units: plan.units,
    connections: Array.isArray(plan.connections) ? plan.connections : [],
  }
  const next = parsePlantDesign(JSON.stringify(merged))
  const expectedSite = brief ? requestedDesignSite(design, brief) : design.site
  const issues = validatePlantDesign(next)
  if (JSON.stringify(next.site.boundary) !== JSON.stringify(expectedSite.boundary) || next.site.clearance !== expectedSite.clearance) issues.push({ code: "brief", message: "敷地境界または余白が指定条件と一致しません。" })
  for (const zone of expectedSite.exclusions) {
    if (!next.site.exclusions.some((candidate) => candidate.id === zone.id && JSON.stringify(candidate.polygon) === JSON.stringify(zone.polygon))) issues.push({ code: "brief", message: `${zone.name}: 既存禁止区域を保持してください。` })
  }
  return { design: next, issues, notes: typeof plan.notes === "string" ? plan.notes.slice(0, 600) : "" }
}

export function confirmDesignPlan(current: PlantDesign, basis: string, result: DesignPlanResult): PlantDesign {
  if (JSON.stringify(current) !== basis) throw new Error("生成後に元の設計が変更されました。もう一度生成してください。")
  if (result.issues.length) throw new Error("設計チェックの指摘があるため反映できません。")
  return assertPlantDesign(JSON.stringify(result.design))
}

// 選択中のオブジェクトについて質問できるように、編集中の設計を要約して渡す。
export function designContextJson(design: PlantDesign, selectedUnitId: string, selectedNodeId: string | null, selectedPartId?: string): string {
  const unit = design.units.find((candidate) => candidate.id === selectedUnitId) ?? null
  const module = unit ? design.modules.find((candidate) => candidate.id === unit.moduleId) ?? null : null
  const nodeId = unit && selectedNodeId?.startsWith(`${unit.id}/`) ? selectedNodeId.slice(unit.id.length + 1) : null
  const equipment = module && nodeId ? module.equipment.find((candidate) => candidate.id === nodeId) ?? null : null
  return JSON.stringify({
    scope: equipment ? "object" : unit ? "unit" : "design",
    source: "編集中の設計（未保存を含む。資料索引・故障履歴は未接続）",
    designId: design.id,
    name: design.name,
    revision: design.revision,
    site: { boundary: design.site.boundary, clearance: design.site.clearance, exclusions: design.site.exclusions.map((zone) => ({ id: zone.id, name: zone.name })) },
    units: design.units.map((candidate) => ({ id: candidate.id, moduleId: candidate.moduleId, name: candidate.name, position: candidate.position, rotation: candidate.rotation })),
    connections: design.connections.map((connection) => ({ id: connection.id, from: connection.from, to: connection.to, elevation: connection.elevation, lane: connection.lane })),
    selected: unit ? {
      unitId: unit.id,
      unitName: unit.name,
      position: unit.position,
      rotation: unit.rotation,
      moduleId: module?.id ?? unit.moduleId,
      moduleName: module?.name ?? "",
      internalConnections: module?.connections ?? [],
      equipment: equipment ? {
        nodeId: equipment.id,
        tag: equipment.tag,
        name: equipment.name,
        kind: equipment.kind,
        size: equipment.size,
        properties: equipment.properties,
        ports: equipmentPorts({ ...equipment, area: module?.name ?? "", documentIds: [] } as PlantNode).map((port) => `${port.id}:${port.medium}`),
        partId: selectedPartId ?? null,
      } : null,
      linkedConnections: design.connections.filter((connection) => connection.from.unitId === unit.id || connection.to.unitId === unit.id).map((connection) => connection.id),
    } : null,
    issues: validatePlantDesign(design).map((issue) => issue.message).slice(0, 20),
  })
}

export const DESIGN_QUICK_REPLIES = [
  { title: "この設備は", text: "選択中の設備の役割と、この配置での接続関係を設計コンテキストだけを根拠に説明してください。" },
  { title: "配置の是非", text: "選択中のユニットの位置と向きについて、敷地・余白・搬入動線の観点から良い点と懸念を挙げてください。" },
  { title: "改善案", text: "選択中のユニットをどう動かせば設計チェックの指摘が減るか、代替の座標と回転を具体的に示してください。" },
] as const
