import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

// Projects
export async function getProjects() {
  return client().getRecords(`${P}_projects`)
}
export async function createProject(data: Record<string, unknown>) {
  return client().createRecord(`${P}_projects`, data)
}
export async function updateProject(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_projects`, id, data)
}
export async function deleteProject(id: string) {
  return client().deleteRecord(`${P}_projects`, id)
}

// Tasks
export async function getTasks() {
  return client().getRecords(`${P}_tasks`)
}
export async function createTask(data: Record<string, unknown>) {
  return client().createRecord(`${P}_tasks`, data)
}
export async function updateTask(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_tasks`, id, data)
}
export async function deleteTask(id: string) {
  return client().deleteRecord(`${P}_tasks`, id)
}

// Members
export async function getMembers() {
  return client().getRecords(`${P}_members`)
}
export async function createMember(data: Record<string, unknown>) {
  return client().createRecord(`${P}_members`, data)
}
export async function updateMember(id: string, data: Record<string, unknown>) {
  return client().updateRecord(`${P}_members`, id, data)
}
export async function deleteMember(id: string) {
  return client().deleteRecord(`${P}_members`, id)
}

// Current user
export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
