import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getVehicles() { return client().getRecords(`${P}_vehicles`) }
export async function createVehicle(data: Record<string, unknown>) { return client().createRecord(`${P}_vehicles`, data) }
export async function updateVehicle(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_vehicles`, id, data) }
export async function deleteVehicle(id: string) { return client().deleteRecord(`${P}_vehicles`, id) }

export async function getRoutes() { return client().getRecords(`${P}_delivery_routes`) }
export async function createRoute(data: Record<string, unknown>) { return client().createRecord(`${P}_delivery_routes`, data) }
export async function updateRoute(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_delivery_routes`, id, data) }
export async function deleteRoute(id: string) { return client().deleteRecord(`${P}_delivery_routes`, id) }

export async function getStops() { return client().getRecords(`${P}_stops`) }
export async function createStop(data: Record<string, unknown>) { return client().createRecord(`${P}_stops`, data) }
export async function updateStop(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_stops`, id, data) }
export async function deleteStop(id: string) { return client().deleteRecord(`${P}_stops`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
