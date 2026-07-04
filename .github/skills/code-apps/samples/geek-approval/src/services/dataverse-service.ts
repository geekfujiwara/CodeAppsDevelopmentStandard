import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getApprovalRequests() { return client().getRecords(`${P}_approval_requests`) }
export async function createApprovalRequest(data: Record<string, unknown>) { return client().createRecord(`${P}_approval_requests`, data) }
export async function updateApprovalRequest(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_approval_requests`, id, data) }
export async function deleteApprovalRequest(id: string) { return client().deleteRecord(`${P}_approval_requests`, id) }

export async function getApprovalSteps() { return client().getRecords(`${P}_approval_steps`) }
export async function createApprovalStep(data: Record<string, unknown>) { return client().createRecord(`${P}_approval_steps`, data) }
export async function deleteApprovalStep(id: string) { return client().deleteRecord(`${P}_approval_steps`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
