import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

// Tickets
export async function getTickets() {
  return client().getRecords(`${P}_tickets`)
}
export async function createTicket(data: Record<string, unknown>) {
  return client().createRecord(`${P}_tickets`, data)
}
export async function updateTicket(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_tickets`, id, data)
}
export async function deleteTicket(id: string) {
  return client().deleteRecord(`${P}_tickets`, id)
}

// Knowledge
export async function getKnowledge() {
  return client().getRecords(`${P}_knowledges`)
}
export async function createKnowledge(data: Record<string, unknown>) {
  return client().createRecord(`${P}_knowledges`, data)
}
export async function updateKnowledge(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_knowledges`, id, data)
}
export async function deleteKnowledge(id: string) {
  return client().deleteRecord(`${P}_knowledges`, id)
}

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
