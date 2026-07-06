import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getCheckpoints() { return client().getRecords(`${P}_checkpoints`) }
export async function createCheckpoint(data: Record<string, unknown>) { return client().createRecord(`${P}_checkpoints`, data) }
export async function updateCheckpoint(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_checkpoints`, id, data) }
export async function deleteCheckpoint(id: string) { return client().deleteRecord(`${P}_checkpoints`, id) }

export async function getMeasurements() { return client().getRecords(`${P}_measurements`) }
export async function createMeasurement(data: Record<string, unknown>) { return client().createRecord(`${P}_measurements`, data) }
export async function updateMeasurement(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_measurements`, id, data) }
export async function deleteMeasurement(id: string) { return client().deleteRecord(`${P}_measurements`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
