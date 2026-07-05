import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getInspections() { return client().getRecords(`${P}_inspections`) }
export async function createInspection(data: Record<string, unknown>) { return client().createRecord(`${P}_inspections`, data) }
export async function updateInspection(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_inspections`, id, data) }
export async function deleteInspection(id: string) { return client().deleteRecord(`${P}_inspections`, id) }

export async function getDefects() { return client().getRecords(`${P}_defects`) }
export async function createDefect(data: Record<string, unknown>) { return client().createRecord(`${P}_defects`, data) }
export async function updateDefect(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_defects`, id, data) }
export async function deleteDefect(id: string) { return client().deleteRecord(`${P}_defects`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
