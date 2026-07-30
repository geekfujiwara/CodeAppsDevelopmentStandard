import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getStores() { return DataverseService.ListRecords(`${P}_stores`) }
export async function createStore(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_stores`, data) }
export async function updateStore(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_stores`, id, data) }
export async function deleteStore(id: string) { return DataverseService.DeleteRecord(`${P}_stores`, id) }

export async function getAudits() { return DataverseService.ListRecords(`${P}_store_audits`) }
export async function createAudit(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_store_audits`, data) }
export async function updateAudit(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_store_audits`, id, data) }
export async function deleteAudit(id: string) { return DataverseService.DeleteRecord(`${P}_store_audits`, id) }

export async function getAuditItems() { return DataverseService.ListRecords(`${P}_audit_items`) }
export async function createAuditItem(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_audit_items`, data) }
export async function updateAuditItem(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_audit_items`, id, data) }
export async function deleteAuditItem(id: string) { return DataverseService.DeleteRecord(`${P}_audit_items`, id) }

export async function getCurrentUserId() {
  const ctx = await getContext()
  const entraId = ctx.user?.objectId
  if (!entraId) return undefined
  const records = await DataverseService.ListRecords(
    "systemusers",
    ["systemuserid"],
    `azureactivedirectoryobjectid eq ${entraId}`,
  )
  return records[0]?.systemuserid as string | undefined
}
