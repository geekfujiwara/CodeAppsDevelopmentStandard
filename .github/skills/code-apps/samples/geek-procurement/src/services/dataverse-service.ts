import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getPurchaseRequests() { return client().getRecords(`${P}_purchase_requests`) }
export async function createPurchaseRequest(data: Record<string, unknown>) { return client().createRecord(`${P}_purchase_requests`, data) }
export async function updatePurchaseRequest(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_purchase_requests`, id, data) }
export async function deletePurchaseRequest(id: string) { return client().deleteRecord(`${P}_purchase_requests`, id) }

export async function getVendors() { return client().getRecords(`${P}_vendors`) }
export async function createVendor(data: Record<string, unknown>) { return client().createRecord(`${P}_vendors`, data) }
export async function updateVendor(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_vendors`, id, data) }
export async function deleteVendor(id: string) { return client().deleteRecord(`${P}_vendors`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
