import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getApprovalRequests() { return DataverseService.ListRecords(`${P}_approval_requests`) }
export async function createApprovalRequest(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_approval_requests`, data) }
export async function updateApprovalRequest(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_approval_requests`, id, data) }
export async function deleteApprovalRequest(id: string) { return DataverseService.DeleteRecord(`${P}_approval_requests`, id) }

export async function getApprovalSteps() { return DataverseService.ListRecords(`${P}_approval_steps`) }
export async function createApprovalStep(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_approval_steps`, data) }
export async function deleteApprovalStep(id: string) { return DataverseService.DeleteRecord(`${P}_approval_steps`, id) }

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
