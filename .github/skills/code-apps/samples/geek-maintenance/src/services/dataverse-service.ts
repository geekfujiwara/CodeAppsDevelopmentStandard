import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


// Equipment
export async function getEquipment() {
  return DataverseService.ListRecords(`${P}_equipment`)
}
export async function createEquipment(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_equipment`, data)
}
export async function updateEquipment(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_equipment`, id, data)
}
export async function deleteEquipment(id: string) {
  return DataverseService.DeleteRecord(`${P}_equipment`, id)
}

// Work Orders
export async function getWorkOrders() {
  return DataverseService.ListRecords(`${P}_work_order`)
}
export async function createWorkOrder(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_work_order`, data)
}
export async function updateWorkOrder(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_work_order`, id, data)
}
export async function deleteWorkOrder(id: string) {
  return DataverseService.DeleteRecord(`${P}_work_order`, id)
}

// Schedules
export async function getSchedules() {
  return DataverseService.ListRecords(`${P}_schedule`)
}
export async function createSchedule(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_schedule`, data)
}
export async function updateSchedule(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_schedule`, id, data)
}
export async function deleteSchedule(id: string) {
  return DataverseService.DeleteRecord(`${P}_schedule`, id)
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
