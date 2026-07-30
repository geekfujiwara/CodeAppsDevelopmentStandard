import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getSites() { return DataverseService.ListRecords(`${P}_sites`) }
export async function createSite(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_sites`, data) }
export async function updateSite(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_sites`, id, data) }
export async function deleteSite(id: string) { return DataverseService.DeleteRecord(`${P}_sites`, id) }

export async function getPunchItems() { return DataverseService.ListRecords(`${P}_punch_items`) }
export async function createPunchItem(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_punch_items`, data) }
export async function updatePunchItem(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_punch_items`, id, data) }
export async function deletePunchItem(id: string) { return DataverseService.DeleteRecord(`${P}_punch_items`, id) }

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
