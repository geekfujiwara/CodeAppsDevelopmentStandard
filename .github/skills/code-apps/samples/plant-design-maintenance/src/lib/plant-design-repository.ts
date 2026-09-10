import { MicrosoftDataverseService } from "@/integrations/connectors"
import { listAll, str, num, type DataverseRow } from "@/data/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import type { DesignRevision, DesignProposal, DesignStorage } from "@/data/plant-design-store"

const organization = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""
const field = (name: string) => `${PUBLISHER_PREFIX}_${name}`
const table = (kind: string) => `${PUBLISHER_PREFIX}_kbplant${kind}`
function guid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("レコード ID が不正です。")
  return value
}
async function create(kind: string, item: DataverseRow) {
  if (!organization || !PUBLISHER_PREFIX) throw new Error("Dataverse 接続が未設定です。")
  const result = await MicrosoftDataverseService.CreateRecordWithOrganization("return=representation", "application/json", organization, table(kind) + "s", item)
  if (!result.success) throw new Error(`保存に失敗しました。再読込して改訂・権限を確認してください: ${JSON.stringify(result.error ?? "unknown")}`)
}
export async function listPlantDesigns() {
  const rows = await listAll(table("design") + "s", { select: [table("design") + "id", field("name")], orderBy: "modifiedon desc" })
  return rows.map((row) => ({ id: str(row, table("design") + "id")!, name: str(row, field("name")) ?? "名称なし" }))
}
export async function createPlantDesignRecord(name: string) {
  const id = crypto.randomUUID()
  await create("design", { [table("design") + "id"]: id, [field("name")]: name })
  return id
}
export async function listDesignRevisions(designId: string): Promise<DesignRevision[]> {
  const rows = await listAll(table("revision") + "s", { filter: `_${field("designid")}_value eq ${guid(designId)}`, orderBy: `${field("revision")} desc`, select: [table("revision") + "id", field("revision"), field("json"), field("hash"), `_${field("proposalid")}_value`] })
  return rows.map((row) => ({ id: str(row, table("revision") + "id")!, designId, revision: num(row, field("revision")), json: str(row, field("json")) ?? "", hash: str(row, field("hash")) ?? "", proposalId: str(row, `_${field("proposalid")}_value`) ?? undefined }))
}
export async function listDesignProposals(designId: string): Promise<DesignProposal[]> {
  const rows = await listAll(table("proposal") + "s", { filter: `_${field("designid")}_value eq ${guid(designId)}`, orderBy: "createdon desc" })
  return rows.map((row) => ({ id: str(row, table("proposal") + "id")!, designId, baseRevision: num(row, field("baserevision")), baseHash: str(row, field("basehash")) ?? "", json: str(row, field("json")) ?? "", reason: str(row, field("reason")) ?? "", rejected: num(row, field("decision")) === 100000001 }))
}
export const sharedDesignStorage: DesignStorage = {
  latest: async (id) => (await listDesignRevisions(id))[0] ?? null,
  append: async (revision) => create("revision", {
    [table("revision") + "id"]: guid(revision.id), [field("name")]: `Rev.${revision.revision}`, [field("revision")]: revision.revision,
    [field("json")]: revision.json, [field("hash")]: revision.hash,
    [`${field("designid")}@odata.bind`]: `/${table("design")}s(${guid(revision.designId)})`,
    ...(revision.proposalId ? { [`${field("proposalid")}@odata.bind`]: `/${table("proposal")}s(${guid(revision.proposalId)})` } : {}),
  }),
}
export async function rejectDesignProposal(proposal: DesignProposal) {
  const accepted = (await listDesignRevisions(proposal.designId)).some((revision) => revision.proposalId === proposal.id)
  if (accepted) throw new Error("採用済み提案は却下できません。")
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization("return=representation", "application/json", organization, table("proposal") + "s", guid(proposal.id), { [field("decision")]: 100000001 })
  if (!result.success) throw new Error("提案の却下に失敗しました。")
}