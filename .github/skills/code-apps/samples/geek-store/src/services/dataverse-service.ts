import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getStores() { return client().getRecords(`${P}_stores`) }
export async function createStore(data: Record<string, unknown>) { return client().createRecord(`${P}_stores`, data) }
export async function updateStore(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_stores`, id, data) }
export async function deleteStore(id: string) { return client().deleteRecord(`${P}_stores`, id) }

export async function getAudits() { return client().getRecords(`${P}_store_audits`) }
export async function createAudit(data: Record<string, unknown>) { return client().createRecord(`${P}_store_audits`, data) }
export async function updateAudit(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_store_audits`, id, data) }
export async function deleteAudit(id: string) { return client().deleteRecord(`${P}_store_audits`, id) }

export async function getAuditItems() { return client().getRecords(`${P}_audit_items`) }
export async function createAuditItem(data: Record<string, unknown>) { return client().createRecord(`${P}_audit_items`, data) }
export async function updateAuditItem(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_audit_items`, id, data) }
export async function deleteAuditItem(id: string) { return client().deleteRecord(`${P}_audit_items`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
