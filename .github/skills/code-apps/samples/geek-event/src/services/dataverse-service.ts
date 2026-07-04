import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getEvents() { return client().getRecords(`${P}_events`) }
export async function createEvent(data: Record<string, unknown>) { return client().createRecord(`${P}_events`, data) }
export async function updateEvent(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_events`, id, data) }
export async function deleteEvent(id: string) { return client().deleteRecord(`${P}_events`, id) }

export async function getRegistrations() { return client().getRecords(`${P}_registrations`) }
export async function createRegistration(data: Record<string, unknown>) { return client().createRecord(`${P}_registrations`, data) }
export async function updateRegistration(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_registrations`, id, data) }
export async function deleteRegistration(id: string) { return client().deleteRecord(`${P}_registrations`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
