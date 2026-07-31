import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getInspections() { return DataverseService.ListRecords(`${P}_inspections`) }
export async function createInspection(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_inspections`, data) }
export async function updateInspection(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_inspections`, id, data) }
export async function deleteInspection(id: string) { return DataverseService.DeleteRecord(`${P}_inspections`, id) }

export async function getDefects() { return DataverseService.ListRecords(`${P}_defects`) }
export async function createDefect(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_defects`, data) }
export async function updateDefect(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_defects`, id, data) }
export async function deleteDefect(id: string) { return DataverseService.DeleteRecord(`${P}_defects`, id) }

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
