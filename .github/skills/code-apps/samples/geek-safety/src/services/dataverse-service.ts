import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getIncidents() { return client().getRecords(`${P}_incidents`) }
export async function createIncident(data: Record<string, unknown>) { return client().createRecord(`${P}_incidents`, data) }
export async function updateIncident(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_incidents`, id, data) }
export async function deleteIncident(id: string) { return client().deleteRecord(`${P}_incidents`, id) }

export async function getActions() { return client().getRecords(`${P}_corrective_actions`) }
export async function createAction(data: Record<string, unknown>) { return client().createRecord(`${P}_corrective_actions`, data) }
export async function updateAction(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_corrective_actions`, id, data) }
export async function deleteAction(id: string) { return client().deleteRecord(`${P}_corrective_actions`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
