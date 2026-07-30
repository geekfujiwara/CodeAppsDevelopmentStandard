import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


// Projects
export async function getProjects() {
  return DataverseService.ListRecords(`${P}_projects`)
}
export async function createProject(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_projects`, data)
}
export async function updateProject(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_projects`, id, data)
}
export async function deleteProject(id: string) {
  return DataverseService.DeleteRecord(`${P}_projects`, id)
}

// Tasks
export async function getTasks() {
  return DataverseService.ListRecords(`${P}_tasks`)
}
export async function createTask(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_tasks`, data)
}
export async function updateTask(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_tasks`, id, data)
}
export async function deleteTask(id: string) {
  return DataverseService.DeleteRecord(`${P}_tasks`, id)
}

// Members
export async function getMembers() {
  return DataverseService.ListRecords(`${P}_members`)
}
export async function createMember(data: Record<string, unknown>) {
  return DataverseService.CreateRecord(`${P}_members`, data)
}
export async function updateMember(id: string, data: Record<string, unknown>) {
  return DataverseService.UpdateRecord(`${P}_members`, id, data)
}
export async function deleteMember(id: string) {
  return DataverseService.DeleteRecord(`${P}_members`, id)
}

// Current user
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
