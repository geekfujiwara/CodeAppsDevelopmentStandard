import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getSites() { return client().getRecords(`${P}_sites`) }
export async function createSite(data: Record<string, unknown>) { return client().createRecord(`${P}_sites`, data) }
export async function updateSite(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_sites`, id, data) }
export async function deleteSite(id: string) { return client().deleteRecord(`${P}_sites`, id) }

export async function getPunchItems() { return client().getRecords(`${P}_punch_items`) }
export async function createPunchItem(data: Record<string, unknown>) { return client().createRecord(`${P}_punch_items`, data) }
export async function updatePunchItem(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_punch_items`, id, data) }
export async function deletePunchItem(id: string) { return client().deleteRecord(`${P}_punch_items`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
