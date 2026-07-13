import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getRooms() { return client().getRecords(`${P}_rooms`) }
export async function createRoom(data: Record<string, unknown>) { return client().createRecord(`${P}_rooms`, data) }
export async function updateRoom(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_rooms`, id, data) }
export async function deleteRoom(id: string) { return client().deleteRecord(`${P}_rooms`, id) }

export async function getCleaningLogs() { return client().getRecords(`${P}_cleaning_logs`) }
export async function createCleaningLog(data: Record<string, unknown>) { return client().createRecord(`${P}_cleaning_logs`, data) }
export async function updateCleaningLog(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_cleaning_logs`, id, data) }
export async function deleteCleaningLog(id: string) { return client().deleteRecord(`${P}_cleaning_logs`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
