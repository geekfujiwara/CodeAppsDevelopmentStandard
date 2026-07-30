import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getSuggestions() { return DataverseService.ListRecords(`${P}_suggestions`) }
export async function createSuggestion(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_suggestions`, data) }
export async function updateSuggestion(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_suggestions`, id, data) }
export async function deleteSuggestion(id: string) { return DataverseService.DeleteRecord(`${P}_suggestions`, id) }

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
