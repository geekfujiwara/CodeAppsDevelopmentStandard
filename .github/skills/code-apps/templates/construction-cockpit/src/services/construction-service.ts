import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"

export type Project = {
  id: string
  name: string
  projectNo: string
  client: string
  address: string
  latitude: number
  longitude: number
  startDate: string
  endDate: string
  progress: number
  status: number
  siteManager: string
}

export type WorkType = { id: string; name: string; code: string; category: number }
export type Task = {
  id: string
  name: string
  projectId: string
  workTypeId: string
  plannedStart: string
  plannedEnd: string
  progress: number
  status: number
}
export type DailyReport = {
  id: string
  name: string
  projectId: string
  reportDate: string
  weather: number
  workers: number
  workDetail: string
  nextPlan: string
  remarks: string
  aiDrafted: boolean
  status: number
}
export type KyActivity = {
  id: string
  name: string
  projectId: string
  taskId: string
  date: string
  workDetail: string
  weather: number
  equipment: string
  hazards: string
  countermeasures: string
  aiPrediction: string
  riskLevel: number
}
export type Incident = {
  id: string
  name: string
  projectId: string
  taskId: string
  workTypeId: string
  occurredOn: string
  incidentType: number
  description: string
  cause: string
  countermeasure: string
  latitude: number
  longitude: number
  knowledgeCreated: boolean
}
export type Knowledge = {
  id: string
  name: string
  workTypeId: string
  sourceIncidentId: string
  knowledgeType: number
  event: string
  cause: string
  lesson: string
  keywords: string
}
export type Equipment = { id: string; name: string; type: number; assetNo: string }
export type EquipmentUsage = { id: string; name: string; reportId: string; equipmentId: string; hours: number }

const text = (row: DataverseRow, key: string) => String(row[key] ?? "")
const number = (row: DataverseRow, key: string) => Number(row[key] ?? 0)
const bool = (row: DataverseRow, key: string) => Boolean(row[key])

export const ConstructionService = {
  async projects(): Promise<Project[]> {
    const rows = await DataverseService.list("${PUBLISHER_PREFIX}_project", undefined, undefined, "${PUBLISHER_PREFIX}_name asc")
    return rows.map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_projectid"), name: text(row, "${PUBLISHER_PREFIX}_name"), projectNo: text(row, "${PUBLISHER_PREFIX}_projectno"),
      client: text(row, "${PUBLISHER_PREFIX}_client"), address: text(row, "${PUBLISHER_PREFIX}_address"),
      latitude: number(row, "${PUBLISHER_PREFIX}_latitude"), longitude: number(row, "${PUBLISHER_PREFIX}_longitude"),
      startDate: text(row, "${PUBLISHER_PREFIX}_startdate"), endDate: text(row, "${PUBLISHER_PREFIX}_enddate"),
      progress: number(row, "${PUBLISHER_PREFIX}_progress"), status: number(row, "${PUBLISHER_PREFIX}_status"),
      siteManager: text(row, "${PUBLISHER_PREFIX}_sitemanager"),
    }))
  },
  async workTypes(): Promise<WorkType[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_worktype")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_worktypeid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      code: text(row, "${PUBLISHER_PREFIX}_code"), category: number(row, "${PUBLISHER_PREFIX}_category"),
    }))
  },
  async tasks(): Promise<Task[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_task")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_taskid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      projectId: text(row, "_${PUBLISHER_PREFIX}_project_value"), workTypeId: text(row, "_${PUBLISHER_PREFIX}_worktype_value"),
      plannedStart: text(row, "${PUBLISHER_PREFIX}_plannedstart"), plannedEnd: text(row, "${PUBLISHER_PREFIX}_plannedend"),
      progress: number(row, "${PUBLISHER_PREFIX}_progress"), status: number(row, "${PUBLISHER_PREFIX}_status"),
    }))
  },
  async reports(): Promise<DailyReport[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_dailyreport", undefined, undefined, "${PUBLISHER_PREFIX}_reportdate desc")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_dailyreportid"), name: text(row, "${PUBLISHER_PREFIX}_name"), projectId: text(row, "_${PUBLISHER_PREFIX}_project_value"),
      reportDate: text(row, "${PUBLISHER_PREFIX}_reportdate"), weather: number(row, "${PUBLISHER_PREFIX}_weather"), workers: number(row, "${PUBLISHER_PREFIX}_workers"),
      workDetail: text(row, "${PUBLISHER_PREFIX}_workdetail"), nextPlan: text(row, "${PUBLISHER_PREFIX}_nextplan"), remarks: text(row, "${PUBLISHER_PREFIX}_remarks"),
      aiDrafted: bool(row, "${PUBLISHER_PREFIX}_aidrafted"), status: number(row, "${PUBLISHER_PREFIX}_status"),
    }))
  },
  async kyActivities(): Promise<KyActivity[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_kyactivity", undefined, undefined, "${PUBLISHER_PREFIX}_kydate desc")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_kyactivityid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      projectId: text(row, "_${PUBLISHER_PREFIX}_project_value"), taskId: text(row, "_${PUBLISHER_PREFIX}_task_value"),
      date: text(row, "${PUBLISHER_PREFIX}_kydate"), workDetail: text(row, "${PUBLISHER_PREFIX}_workdetail"), weather: number(row, "${PUBLISHER_PREFIX}_weather"),
      equipment: text(row, "${PUBLISHER_PREFIX}_equipmenttext"), hazards: text(row, "${PUBLISHER_PREFIX}_hazards"),
      countermeasures: text(row, "${PUBLISHER_PREFIX}_countermeasures"), aiPrediction: text(row, "${PUBLISHER_PREFIX}_aiprediction"),
      riskLevel: number(row, "${PUBLISHER_PREFIX}_risklevel"),
    }))
  },
  async incidents(): Promise<Incident[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_incident", undefined, undefined, "${PUBLISHER_PREFIX}_occurredon desc")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_incidentid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      projectId: text(row, "_${PUBLISHER_PREFIX}_project_value"), taskId: text(row, "_${PUBLISHER_PREFIX}_task_value"),
      workTypeId: text(row, "_${PUBLISHER_PREFIX}_worktype_value"), occurredOn: text(row, "${PUBLISHER_PREFIX}_occurredon"),
      incidentType: number(row, "${PUBLISHER_PREFIX}_incidenttype"), description: text(row, "${PUBLISHER_PREFIX}_description"),
      cause: text(row, "${PUBLISHER_PREFIX}_cause"), countermeasure: text(row, "${PUBLISHER_PREFIX}_countermeasure"),
      latitude: number(row, "${PUBLISHER_PREFIX}_latitude"), longitude: number(row, "${PUBLISHER_PREFIX}_longitude"),
      knowledgeCreated: bool(row, "${PUBLISHER_PREFIX}_knowledgecreated"),
    }))
  },
  async knowledge(): Promise<Knowledge[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_knowledge", undefined, undefined, "${PUBLISHER_PREFIX}_name asc")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_knowledgeid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      workTypeId: text(row, "_${PUBLISHER_PREFIX}_worktype_value"), sourceIncidentId: text(row, "_${PUBLISHER_PREFIX}_sourceincident_value"),
      knowledgeType: number(row, "${PUBLISHER_PREFIX}_knowledgetype"), event: text(row, "${PUBLISHER_PREFIX}_event"),
      cause: text(row, "${PUBLISHER_PREFIX}_cause"), lesson: text(row, "${PUBLISHER_PREFIX}_lesson"), keywords: text(row, "${PUBLISHER_PREFIX}_keywords"),
    }))
  },
  async equipment(): Promise<Equipment[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_equipment")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_equipmentid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      type: number(row, "${PUBLISHER_PREFIX}_equipmenttype"), assetNo: text(row, "${PUBLISHER_PREFIX}_assetno"),
    }))
  },
  async equipmentUsage(): Promise<EquipmentUsage[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_equipmentusage")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_equipmentusageid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      reportId: text(row, "_${PUBLISHER_PREFIX}_dailyreport_value"), equipmentId: text(row, "_${PUBLISHER_PREFIX}_equipment_value"),
      hours: number(row, "${PUBLISHER_PREFIX}_hours"),
    }))
  },
  createKy(body: DataverseRow) {
    return DataverseService.create("${PUBLISHER_PREFIX}_kyactivity", body)
  },
  createIncident(body: DataverseRow) {
    return DataverseService.create("${PUBLISHER_PREFIX}_incident", body)
  },
  createReport(body: DataverseRow) {
    return DataverseService.create("${PUBLISHER_PREFIX}_dailyreport", body)
  },
  createKnowledge(body: DataverseRow) {
    return DataverseService.create("${PUBLISHER_PREFIX}_knowledge", body)
  },
  updateIncident(id: string, body: DataverseRow) {
    return DataverseService.update("${PUBLISHER_PREFIX}_incident", id, body)
  },
}
