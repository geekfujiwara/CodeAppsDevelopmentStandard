import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


// Tickets
export async function getTickets() {
  return DataverseService.ListRecords(`${P}_tickets`)
}
export async function createTicket(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_tickets`, data)
}
export async function updateTicket(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_tickets`, id, data)
}
export async function deleteTicket(id: string) {
  return DataverseService.DeleteRecord(`${P}_tickets`, id)
}

// Knowledge
export async function getKnowledge() {
  return DataverseService.ListRecords(`${P}_knowledges`)
}
export async function createKnowledge(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_knowledges`, data)
}
export async function updateKnowledge(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_knowledges`, id, data)
}
export async function deleteKnowledge(id: string) {
  return DataverseService.DeleteRecord(`${P}_knowledges`, id)
}

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
