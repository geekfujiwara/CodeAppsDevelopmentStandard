import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getVehicles() { return DataverseService.ListRecords(`${P}_vehicles`) }
export async function createVehicle(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_vehicles`, data) }
export async function updateVehicle(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_vehicles`, id, data) }
export async function deleteVehicle(id: string) { return DataverseService.DeleteRecord(`${P}_vehicles`, id) }

export async function getRoutes() { return DataverseService.ListRecords(`${P}_delivery_routes`) }
export async function createRoute(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_delivery_routes`, data) }
export async function updateRoute(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_delivery_routes`, id, data) }
export async function deleteRoute(id: string) { return DataverseService.DeleteRecord(`${P}_delivery_routes`, id) }

export async function getStops() { return DataverseService.ListRecords(`${P}_stops`) }
export async function createStop(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_stops`, data) }
export async function updateStop(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_stops`, id, data) }
export async function deleteStop(id: string) { return DataverseService.DeleteRecord(`${P}_stops`, id) }

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
