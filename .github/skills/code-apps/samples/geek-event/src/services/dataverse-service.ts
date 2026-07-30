import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getEvents() { return DataverseService.ListRecords(`${P}_events`) }
export async function createEvent(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_events`, data) }
export async function updateEvent(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_events`, id, data) }
export async function deleteEvent(id: string) { return DataverseService.DeleteRecord(`${P}_events`, id) }

export async function getRegistrations() { return DataverseService.ListRecords(`${P}_registrations`) }
export async function createRegistration(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_registrations`, data) }
export async function updateRegistration(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_registrations`, id, data) }
export async function deleteRegistration(id: string) { return DataverseService.DeleteRecord(`${P}_registrations`, id) }

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
