import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


// Contracts
export async function getContracts() {
  return DataverseService.ListRecords(`${P}_contracts`)
}
export async function createContract(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_contracts`, data)
}
export async function updateContract(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_contracts`, id, data)
}
export async function deleteContract(id: string) {
  return DataverseService.DeleteRecord(`${P}_contracts`, id)
}

// Counterparties
export async function getCounterparties() {
  return DataverseService.ListRecords(`${P}_counterparties`)
}
export async function createCounterparty(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_counterparties`, data)
}
export async function updateCounterparty(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_counterparties`, id, data)
}
export async function deleteCounterparty(id: string) {
  return DataverseService.DeleteRecord(`${P}_counterparties`, id)
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
