import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getSuggestions() { return client().getRecords(`${P}_suggestions`) }
export async function createSuggestion(data: Record<string, unknown>) { return client().createRecord(`${P}_suggestions`, data) }
export async function updateSuggestion(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_suggestions`, id, data) }
export async function deleteSuggestion(id: string) { return client().deleteRecord(`${P}_suggestions`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
