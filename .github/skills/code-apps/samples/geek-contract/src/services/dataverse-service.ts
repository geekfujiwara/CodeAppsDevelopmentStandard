import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

// Contracts
export async function getContracts() {
  return client().getRecords(`${P}_contracts`)
}
export async function createContract(data: Record<string, unknown>) {
  return client().createRecord(`${P}_contracts`, data)
}
export async function updateContract(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_contracts`, id, data)
}
export async function deleteContract(id: string) {
  return client().deleteRecord(`${P}_contracts`, id)
}

// Counterparties
export async function getCounterparties() {
  return client().getRecords(`${P}_counterparties`)
}
export async function createCounterparty(data: Record<string, unknown>) {
  return client().createRecord(`${P}_counterparties`, data)
}
export async function updateCounterparty(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_counterparties`, id, data)
}
export async function deleteCounterparty(id: string) {
  return client().deleteRecord(`${P}_counterparties`, id)
}

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
