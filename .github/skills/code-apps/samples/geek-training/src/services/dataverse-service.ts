import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getCourses() { return client().getRecords(`${P}_courses`) }
export async function createCourse(data: Record<string, unknown>) { return client().createRecord(`${P}_courses`, data) }
export async function updateCourse(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_courses`, id, data) }
export async function deleteCourse(id: string) { return client().deleteRecord(`${P}_courses`, id) }

export async function getEnrollments() { return client().getRecords(`${P}_enrollments`) }
export async function createEnrollment(data: Record<string, unknown>) { return client().createRecord(`${P}_enrollments`, data) }
export async function updateEnrollment(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_enrollments`, id, data) }
export async function deleteEnrollment(id: string) { return client().deleteRecord(`${P}_enrollments`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
