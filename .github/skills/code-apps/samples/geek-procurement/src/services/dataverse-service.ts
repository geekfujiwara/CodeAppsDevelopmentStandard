import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getPurchaseRequests() { return DataverseService.ListRecords(`${P}_purchase_requests`) }
export async function createPurchaseRequest(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_purchase_requests`, data) }
export async function updatePurchaseRequest(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_purchase_requests`, id, data) }
export async function deletePurchaseRequest(id: string) { return DataverseService.DeleteRecord(`${P}_purchase_requests`, id) }

export async function getVendors() { return DataverseService.ListRecords(`${P}_vendors`) }
export async function createVendor(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_vendors`, data) }
export async function updateVendor(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_vendors`, id, data) }
export async function deleteVendor(id: string) { return DataverseService.DeleteRecord(`${P}_vendors`, id) }

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
