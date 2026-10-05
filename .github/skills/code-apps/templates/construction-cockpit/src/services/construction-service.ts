import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { asciiFileName, base64ToBytes } from "@/lib/binary"
import type { CadMapping } from "@/lib/models/cad-import"
import { BUNDLED_BRIDGE_URL, CAD_MODEL_URL, MODEL_TYPE_BRIDGE } from "@/lib/models/model-source"

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
  modelUrl: string
  modelCenter: string
  modelType: number
  /** CAD モデルの対応付け（cad-import.ts の CadMapping を JSON 化したもの） */
  modelMapping: string
  /** ファイル列 ${PUBLISHER_PREFIX}_modelfile のファイル ID（再アップロードで変わるため、取得キャッシュのキーに使う） */
  modelFileId: string
  modelFileName: string
  description: string
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
  reportedProgress: number
  reviewStatus: number
  reviewComment: string
  zone: string
  sequence: number
  issue: string
  predecessorId: string
  /** 施工位置イメージ（画像列 ${PUBLISHER_PREFIX}_locationimage）の更新時刻。未保存なら 0 */
  locationImageVersion: number
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
  reviewStatus: number
  reviewComment: string
  photoUrl: string
  photoCaption: string
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
const escapeOData = (value: string) => value.replaceAll("'", "''")

const mapProject = (row: DataverseRow): Project => ({
  id: text(row, "${PUBLISHER_PREFIX}_projectid"), name: text(row, "${PUBLISHER_PREFIX}_name"), projectNo: text(row, "${PUBLISHER_PREFIX}_projectno"),
  client: text(row, "${PUBLISHER_PREFIX}_client"), address: text(row, "${PUBLISHER_PREFIX}_address"),
  latitude: number(row, "${PUBLISHER_PREFIX}_latitude"), longitude: number(row, "${PUBLISHER_PREFIX}_longitude"),
  startDate: text(row, "${PUBLISHER_PREFIX}_startdate"), endDate: text(row, "${PUBLISHER_PREFIX}_enddate"),
  progress: number(row, "${PUBLISHER_PREFIX}_progress"), status: number(row, "${PUBLISHER_PREFIX}_status"),
  siteManager: text(row, "${PUBLISHER_PREFIX}_sitemanager"), modelUrl: text(row, "${PUBLISHER_PREFIX}_modelurl"),
  modelCenter: text(row, "${PUBLISHER_PREFIX}_modelcenter"), modelType: number(row, "${PUBLISHER_PREFIX}_modeltype"),
  modelMapping: text(row, "${PUBLISHER_PREFIX}_modelmapping"), modelFileId: text(row, "${PUBLISHER_PREFIX}_modelfile"),
  modelFileName: text(row, "${PUBLISHER_PREFIX}_modelfile_name"),
  description: text(row, "${PUBLISHER_PREFIX}_description"),
})

const modelCache = new Map<string, Promise<ArrayBuffer>>()

export const ConstructionService = {
  async projects(): Promise<Project[]> {
    const rows = await DataverseService.list("${PUBLISHER_PREFIX}_project", undefined, undefined, "${PUBLISHER_PREFIX}_name asc")
    return rows.map(mapProject)
  },
  async searchProjects(query: string): Promise<Project[]> {
    const keyword = escapeOData(query.trim())
    if (!keyword) return this.projects()
    const filter = [
      `contains(${PUBLISHER_PREFIX}_name,'${keyword}')`, `contains(${PUBLISHER_PREFIX}_projectno,'${keyword}')`,
      `contains(${PUBLISHER_PREFIX}_client,'${keyword}')`, `contains(${PUBLISHER_PREFIX}_address,'${keyword}')`,
    ].join(" or ")
    return (await DataverseService.list("${PUBLISHER_PREFIX}_project", undefined, filter, "${PUBLISHER_PREFIX}_name asc")).map(mapProject)
  },
  async workTypes(): Promise<WorkType[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_worktype")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_worktypeid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      code: text(row, "${PUBLISHER_PREFIX}_code"), category: number(row, "${PUBLISHER_PREFIX}_category"),
    }))
  },
  async tasks(): Promise<Task[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_task", undefined, undefined, "${PUBLISHER_PREFIX}_sequence asc")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_taskid"), name: text(row, "${PUBLISHER_PREFIX}_name"),
      projectId: text(row, "_${PUBLISHER_PREFIX}_project_value"), workTypeId: text(row, "_${PUBLISHER_PREFIX}_worktype_value"),
      plannedStart: text(row, "${PUBLISHER_PREFIX}_plannedstart"), plannedEnd: text(row, "${PUBLISHER_PREFIX}_plannedend"),
      progress: number(row, "${PUBLISHER_PREFIX}_progress"), status: number(row, "${PUBLISHER_PREFIX}_status"),
      reportedProgress: number(row, "${PUBLISHER_PREFIX}_reportedprogress"), reviewStatus: number(row, "${PUBLISHER_PREFIX}_reviewstatus"),
      reviewComment: text(row, "${PUBLISHER_PREFIX}_reviewcomment"), zone: text(row, "${PUBLISHER_PREFIX}_zone"),
      sequence: number(row, "${PUBLISHER_PREFIX}_sequence"), issue: text(row, "${PUBLISHER_PREFIX}_issue"),
      predecessorId: text(row, "_${PUBLISHER_PREFIX}_predecessor_value"),
      locationImageVersion: number(row, "${PUBLISHER_PREFIX}_locationimage_timestamp"),
    }))
  },
  async reports(): Promise<DailyReport[]> {
    return (await DataverseService.list("${PUBLISHER_PREFIX}_dailyreport", undefined, undefined, "${PUBLISHER_PREFIX}_reportdate desc")).map((row) => ({
      id: text(row, "${PUBLISHER_PREFIX}_dailyreportid"), name: text(row, "${PUBLISHER_PREFIX}_name"), projectId: text(row, "_${PUBLISHER_PREFIX}_project_value"),
      reportDate: text(row, "${PUBLISHER_PREFIX}_reportdate"), weather: number(row, "${PUBLISHER_PREFIX}_weather"), workers: number(row, "${PUBLISHER_PREFIX}_workers"),
      workDetail: text(row, "${PUBLISHER_PREFIX}_workdetail"), nextPlan: text(row, "${PUBLISHER_PREFIX}_nextplan"), remarks: text(row, "${PUBLISHER_PREFIX}_remarks"),
      aiDrafted: bool(row, "${PUBLISHER_PREFIX}_aidrafted"), status: number(row, "${PUBLISHER_PREFIX}_status"),
      reviewStatus: number(row, "${PUBLISHER_PREFIX}_reviewstatus"), reviewComment: text(row, "${PUBLISHER_PREFIX}_reviewcomment"),
      photoUrl: text(row, "${PUBLISHER_PREFIX}_photourl"), photoCaption: text(row, "${PUBLISHER_PREFIX}_photocaption"),
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
  updateReport(id: string, body: DataverseRow) {
    return DataverseService.update("${PUBLISHER_PREFIX}_dailyreport", id, body)
  },
  updateTask(id: string, body: DataverseRow) {
    return DataverseService.update("${PUBLISHER_PREFIX}_task", id, body)
  },
  updateKy(id: string, body: DataverseRow) {
    return DataverseService.update("${PUBLISHER_PREFIX}_kyactivity", id, body)
  },
  updateKnowledge(id: string, body: DataverseRow) {
    return DataverseService.update("${PUBLISHER_PREFIX}_knowledge", id, body)
  },
  /** 日報の監督確認。承認で確定（${PUBLISHER_PREFIX}_status=確定）、差戻しは理由が必須 */
  reviewReport(id: string, action: "approve" | "return", comment: string) {
    if (action === "return" && !comment.trim()) throw new Error("差戻し理由を入力してください。")
    return DataverseService.update("${PUBLISHER_PREFIX}_dailyreport", id, action === "approve"
      ? { ${PUBLISHER_PREFIX}_reviewstatus: 100000002, ${PUBLISHER_PREFIX}_reviewcomment: comment, ${PUBLISHER_PREFIX}_status: 100000001 }
      : { ${PUBLISHER_PREFIX}_reviewstatus: 100000003, ${PUBLISHER_PREFIX}_reviewcomment: comment })
  },
  /** 工程進捗の監督確認。承認した値が進捗（${PUBLISHER_PREFIX}_progress）になり、3D の出来形に反映される */
  reviewTask(id: string, action: "approve" | "return", comment: string, progress: number) {
    if (action === "return" && !comment.trim()) throw new Error("差戻し理由を入力してください。")
    const value = Math.min(100, Math.max(0, Math.round(progress)))
    return DataverseService.update("${PUBLISHER_PREFIX}_task", id, action === "approve"
      ? { ${PUBLISHER_PREFIX}_reviewstatus: 100000002, ${PUBLISHER_PREFIX}_reviewcomment: comment, ${PUBLISHER_PREFIX}_progress: value, ${PUBLISHER_PREFIX}_reportedprogress: value, ${PUBLISHER_PREFIX}_status: value >= 100 ? 100000002 : value > 0 ? 100000001 : 100000000 }
      : { ${PUBLISHER_PREFIX}_reviewstatus: 100000003, ${PUBLISHER_PREFIX}_reviewcomment: comment })
  },
  /** ヒヤリハットからナレッジを作り、元の記録をナレッジ化済みにする */
  async incidentToKnowledge(incident: Incident) {
    await DataverseService.create("${PUBLISHER_PREFIX}_knowledge", {
      ${PUBLISHER_PREFIX}_name: incident.name,
      ...(incident.workTypeId ? { "${PUBLISHER_PREFIX}_worktype@odata.bind": `/${PUBLISHER_PREFIX}_worktypes(${incident.workTypeId})` } : {}),
      "${PUBLISHER_PREFIX}_sourceincident@odata.bind": `/${PUBLISHER_PREFIX}_incidents(${incident.id})`,
      ${PUBLISHER_PREFIX}_knowledgetype: incident.incidentType === 100000002 ? 100000001 : 100000000,
      ${PUBLISHER_PREFIX}_event: incident.description, ${PUBLISHER_PREFIX}_cause: incident.cause,
      ${PUBLISHER_PREFIX}_lesson: incident.countermeasure || "再発防止策を現場内で共有する", ${PUBLISHER_PREFIX}_keywords: incident.name,
    })
    await DataverseService.update("${PUBLISHER_PREFIX}_incident", incident.id, { ${PUBLISHER_PREFIX}_knowledgecreated: true })
  },
  /** CAD モデル本体を取得する（同じファイル ID の間はメモリに保持して再ダウンロードしない） */
  downloadProjectModel(project: Project, expectedBytes?: number): Promise<ArrayBuffer> {
    const key = `${project.id}:${project.modelFileId}`
    let cached = modelCache.get(key)
    if (!cached) {
      cached = DataverseService.downloadFile("${PUBLISHER_PREFIX}_project", project.id, "${PUBLISHER_PREFIX}_modelfile", expectedBytes)
        .then((bytes) => bytes.slice().buffer as ArrayBuffer)
      cached.catch(() => modelCache.delete(key))
      modelCache.set(key, cached)
    }
    return cached
  },
  /** CAD モデルと対応付けを保存する。bytes を省略すると対応付けだけを更新する */
  async saveProjectCadModel(project: Project, mapping: CadMapping, bytes?: Uint8Array) {
    if (bytes) {
      await DataverseService.uploadFile("${PUBLISHER_PREFIX}_project", project.id, "${PUBLISHER_PREFIX}_modelfile", asciiFileName(mapping.fileName, `model.${mapping.format}`), bytes)
      for (const key of modelCache.keys()) if (key.startsWith(`${project.id}:`)) modelCache.delete(key)
    }
    const saved: CadMapping = { ...mapping, savedAt: new Date().toISOString() }
    await DataverseService.update("${PUBLISHER_PREFIX}_project", project.id, { ${PUBLISHER_PREFIX}_modelmapping: JSON.stringify(saved), ${PUBLISHER_PREFIX}_modelurl: CAD_MODEL_URL })
    return saved
  },
  /** 標準モデル（工事種別の生成モデル）に戻す。ファイルは残すため、再度 CAD モデルに切り替えられる */
  resetProjectModel(project: Project) {
    return DataverseService.update("${PUBLISHER_PREFIX}_project", project.id, { ${PUBLISHER_PREFIX}_modelurl: project.modelType === MODEL_TYPE_BRIDGE ? BUNDLED_BRIDGE_URL : "" })
  },
  showSavedCadModel(project: Project) {
    return DataverseService.update("${PUBLISHER_PREFIX}_project", project.id, { ${PUBLISHER_PREFIX}_modelurl: CAD_MODEL_URL })
  },
  taskLocationImage(taskId: string) {
    return DataverseService.downloadImage("${PUBLISHER_PREFIX}_task", taskId, "${PUBLISHER_PREFIX}_locationimage")
  },
  saveTaskLocationImage(taskId: string, dataUrl: string) {
    const bytes = base64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1))
    const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg"
    return DataverseService.uploadFile("${PUBLISHER_PREFIX}_task", taskId, "${PUBLISHER_PREFIX}_locationimage", `task-location-${taskId.slice(0, 8)}.${ext}`, bytes)
  },
}
