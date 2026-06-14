import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

// Equipment
export async function getEquipment() {
  return client().getRecords(`${P}_equipment`)
}
export async function createEquipment(data: Record<string, unknown>) {
  return client().createRecord(`${P}_equipment`, data)
}
export async function updateEquipment(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_equipment`, id, data)
}
export async function deleteEquipment(id: string) {
  return client().deleteRecord(`${P}_equipment`, id)
}

// Work Orders
export async function getWorkOrders() {
  return client().getRecords(`${P}_work_order`)
}
export async function createWorkOrder(data: Record<string, unknown>) {
  return client().createRecord(`${P}_work_order`, data)
}
export async function updateWorkOrder(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_work_order`, id, data)
}
export async function deleteWorkOrder(id: string) {
  return client().deleteRecord(`${P}_work_order`, id)
}

// Schedules
export async function getSchedules() {
  return client().getRecords(`${P}_schedule`)
}
export async function createSchedule(data: Record<string, unknown>) {
  return client().createRecord(`${P}_schedule`, data)
}
export async function updateSchedule(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_schedule`, id, data)
}
export async function deleteSchedule(id: string) {
  return client().deleteRecord(`${P}_schedule`, id)
}

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
