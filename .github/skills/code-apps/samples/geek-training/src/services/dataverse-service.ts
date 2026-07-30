import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getCourses() { return DataverseService.ListRecords(`${P}_courses`) }
export async function createCourse(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_courses`, data) }
export async function updateCourse(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_courses`, id, data) }
export async function deleteCourse(id: string) { return DataverseService.DeleteRecord(`${P}_courses`, id) }

export async function getEnrollments() { return DataverseService.ListRecords(`${P}_enrollments`) }
export async function createEnrollment(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_enrollments`, data) }
export async function updateEnrollment(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_enrollments`, id, data) }
export async function deleteEnrollment(id: string) { return DataverseService.DeleteRecord(`${P}_enrollments`, id) }

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
