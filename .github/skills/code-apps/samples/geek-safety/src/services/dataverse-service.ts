import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getIncidents() { return DataverseService.ListRecords(`${P}_incidents`) }
export async function createIncident(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_incidents`, data) }
export async function updateIncident(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_incidents`, id, data) }
export async function deleteIncident(id: string) { return DataverseService.DeleteRecord(`${P}_incidents`, id) }

export async function getActions() { return DataverseService.ListRecords(`${P}_corrective_actions`) }
export async function createAction(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_corrective_actions`, data) }
export async function updateAction(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_corrective_actions`, id, data) }
export async function deleteAction(id: string) { return DataverseService.DeleteRecord(`${P}_corrective_actions`, id) }

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
