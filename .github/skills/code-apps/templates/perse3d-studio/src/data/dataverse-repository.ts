import { DataverseService, type DataverseRow } from "@/data/dataverse-client"
import { newId, type ProjectRepository } from "@/data/repository"
import { parseBuildingSpec } from "@/lib/building-spec"
import type { ListingInfo } from "@/lib/listing"
import type { CameraPose } from "@/lib/building-scene"
import type { CommentInput, Project, ProjectComment, ProjectInput, Role, SourceImages, Stage, Variant } from "@/types/project"

const P = (import.meta.env.VITE_TABLE_PREFIX?.trim() || `${import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || "${PUBLISHER_PREFIX}"}_`)
const PROJECTS = `${P}perseprojects`
const COMMENTS = `${P}persecomments`
const MEMO_MAX = 1_048_576

// Choice 値（scripts/setup_dataverse.py の STAGE / ROLE_CODE と一致させる）
const STAGE_CODE: Record<Stage, number> = { received: 100000000, analyzing: 100000001, "design-review": 100000002, proposal: 100000003, won: 100000004, lost: 100000005 }
const ROLE_CODE: Record<Role, number> = { design: 100000000, sales: 100000001, client: 100000002 }
const invert = <K extends string>(m: Record<K, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<number, K>
const STAGE_OF = invert(STAGE_CODE)
const ROLE_OF = invert(ROLE_CODE)

const PROJECT_LIST_SELECT = ["name", "clientname", "address", "stage", "budget", "designowner", "salesowner", "notes", "imagesjson", "variantsjson", "activevariantid", "specjson", "listingjson"].map(c => `${P}${c}`)
  .concat([`${P}perseprojectid`, "createdon", "modifiedon"])
const COMMENT_SELECT = ["name", "role", "author", "body", "positionjson", "posejson", "resolved"].map(c => `${P}${c}`)
  .concat([`${P}persecommentid`, `_${P}projectid_value`, "createdon"])

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toProject(r: DataverseRow): Project {
  const specRaw = parseJson<unknown>(r[`${P}specjson`], null)
  let spec: Project["spec"] = null
  try {
    spec = specRaw ? parseBuildingSpec(specRaw) : null
  } catch {
    spec = null
  }
  return {
    id: String(r[`${P}perseprojectid`]),
    name: String(r[`${P}name`] ?? ""),
    clientName: String(r[`${P}clientname`] ?? ""),
    address: String(r[`${P}address`] ?? ""),
    stage: STAGE_OF[Number(r[`${P}stage`])] ?? "received",
    budget: r[`${P}budget`] == null ? null : Number(r[`${P}budget`]),
    designOwner: String(r[`${P}designowner`] ?? ""),
    salesOwner: String(r[`${P}salesowner`] ?? ""),
    notes: String(r[`${P}notes`] ?? ""),
    images: parseJson<SourceImages>(r[`${P}imagesjson`], { floorplans: {} }),
    spec,
    variants: parseJson<Variant[]>(r[`${P}variantsjson`], []),
    activeVariantId: (r[`${P}activevariantid`] as string) || null,
    listing: parseJson<ListingInfo | null>(r[`${P}listingjson`], null),
    createdOn: String(r.createdon ?? new Date().toISOString()),
    modifiedOn: String(r.modifiedon ?? new Date().toISOString()),
  }
}

function memo(label: string, value: unknown): string {
  const s = JSON.stringify(value)
  if (s.length > MEMO_MAX) {
    throw new Error(`${label}が Dataverse の保存上限（約 1MB）を超えています。画像の枚数・解像度を減らしてください。`)
  }
  return s
}

function toProjectBody(p: Partial<Project>): DataverseRow {
  const b: DataverseRow = {}
  if (p.name !== undefined) b[`${P}name`] = p.name
  if (p.clientName !== undefined) b[`${P}clientname`] = p.clientName
  if (p.address !== undefined) b[`${P}address`] = p.address
  if (p.stage !== undefined) b[`${P}stage`] = STAGE_CODE[p.stage]
  if (p.budget !== undefined) b[`${P}budget`] = p.budget
  if (p.designOwner !== undefined) b[`${P}designowner`] = p.designOwner
  if (p.salesOwner !== undefined) b[`${P}salesowner`] = p.salesOwner
  if (p.notes !== undefined) b[`${P}notes`] = p.notes
  if (p.images !== undefined) b[`${P}imagesjson`] = memo("受領画像", p.images)
  if (p.spec !== undefined) b[`${P}specjson`] = p.spec ? memo("3D モデル", p.spec) : null
  if (p.variants !== undefined) b[`${P}variantsjson`] = memo("提案プラン", p.variants)
  if (p.activeVariantId !== undefined) b[`${P}activevariantid`] = p.activeVariantId
  if (p.listing !== undefined) b[`${P}listingjson`] = p.listing ? JSON.stringify(p.listing).slice(0, 20000) : null
  return b
}

function toComment(r: DataverseRow): ProjectComment {
  return {
    id: String(r[`${P}persecommentid`]),
    projectId: String(r[`_${P}projectid_value`] ?? ""),
    role: ROLE_OF[Number(r[`${P}role`])] ?? "design",
    author: String(r[`${P}author`] ?? ""),
    body: String(r[`${P}body`] ?? r[`${P}name`] ?? ""),
    position: parseJson<[number, number, number] | null>(r[`${P}positionjson`], null),
    pose: parseJson<CameraPose | null>(r[`${P}posejson`], null),
    resolved: r[`${P}resolved`] === true,
    createdOn: String(r.createdon ?? new Date().toISOString()),
  }
}

const isGuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export class DataverseProjectRepository implements ProjectRepository {
  readonly mode = "dataverse" as const

  async listProjects() {
    const rows = await DataverseService.ListRecords(PROJECTS, PROJECT_LIST_SELECT, undefined, "modifiedon desc")
    return rows.map(toProject)
  }

  async getProject(id: string) {
    if (!isGuid(id)) return null
    const row = await DataverseService.GetItem(PROJECTS, id, PROJECT_LIST_SELECT)
    return row ? toProject(row) : null
  }

  async createProject(input: ProjectInput) {
    // CreateRecord は ID を返さないため、主キーをクライアントで採番して渡す
    const id = newId()
    await DataverseService.CreateRecord(PROJECTS, {
      [`${P}perseprojectid`]: id,
      ...toProjectBody({ ...input, images: input.images ?? { floorplans: {} }, variants: [] }),
    })
    const created = await this.getProject(id)
    if (!created) throw new Error("案件の作成後に取得できませんでした")
    return created
  }

  async updateProject(id: string, patch: Partial<Project>) {
    await DataverseService.UpdateRecord(PROJECTS, id, toProjectBody(patch))
    const updated = await this.getProject(id)
    if (!updated) throw new Error("案件が見つかりません")
    return updated
  }

  async deleteProject(id: string) {
    const comments = await this.listComments(id)
    for (const c of comments) await DataverseService.DeleteRecord(COMMENTS, c.id)
    await DataverseService.DeleteRecord(PROJECTS, id)
  }

  async listComments(projectId: string) {
    if (!isGuid(projectId)) return []
    const rows = await DataverseService.ListRecords(COMMENTS, COMMENT_SELECT, `_${P}projectid_value eq ${projectId}`, "createdon asc")
    return rows.map(toComment)
  }

  async addComment(input: CommentInput) {
    const id = newId()
    await DataverseService.CreateRecord(COMMENTS, {
      [`${P}persecommentid`]: id,
      [`${P}name`]: input.body.slice(0, 90),
      [`${P}role`]: ROLE_CODE[input.role],
      [`${P}author`]: input.author,
      [`${P}body`]: input.body,
      [`${P}positionjson`]: input.position ? JSON.stringify(input.position) : null,
      [`${P}posejson`]: input.pose ? JSON.stringify(input.pose) : null,
      [`${P}resolved`]: input.resolved,
      [`${P}projectid@odata.bind`]: `/${PROJECTS}(${input.projectId})`,
    })
    return { ...input, id, createdOn: new Date().toISOString() }
  }

  async updateComment(id: string, patch: Partial<ProjectComment>) {
    const b: DataverseRow = {}
    if (patch.resolved !== undefined) b[`${P}resolved`] = patch.resolved
    if (patch.body !== undefined) {
      b[`${P}body`] = patch.body
      b[`${P}name`] = patch.body.slice(0, 90)
    }
    await DataverseService.UpdateRecord(COMMENTS, id, b)
  }

  async deleteComment(id: string) {
    await DataverseService.DeleteRecord(COMMENTS, id)
  }
}
