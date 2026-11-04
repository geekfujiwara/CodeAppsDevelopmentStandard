import { getContext } from "@microsoft/power-apps/app"
import { listRecords as list, createRecord as create, updateRecord as update, deleteRecord as remove } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"

// データソース名（dataSourcesInfo のキー = EntitySetName 複数形）
const SRC = {
  customer:  `${P}_customers`,
  engineer:  `${P}_engineers`,
  equipment: `${P}_equipments`,
  contract:  `${P}_maintenancecontracts`,
  call:      `${P}_calls`,
  workorder: `${P}_workorders`,
  report:    `${P}_maintenancereports`,
  dailyreport: `${P}_dailyreports`,
  consumption: `${P}_consumptionrecords`,
  kpi:         `${P}_annualkpis`,
  recommendation: `${P}_recommendations`,
  area:      `${P}_areas`,
}

type Rec = Record<string, unknown>

// ── 顧客 ──
export const getCustomers = () => list(SRC.customer)
export const createCustomer = (d: Rec) => create(SRC.customer, d)
export const updateCustomer = (id: string, d: Rec) => update(SRC.customer, id, d)
export const deleteCustomer = (id: string) => remove(SRC.customer, id)

// ── カスタマーエンジニア ──
export const getEngineers = () => list(SRC.engineer)
export const createEngineer = (d: Rec) => create(SRC.engineer, d)
export const updateEngineer = (id: string, d: Rec) => update(SRC.engineer, id, d)
export const deleteEngineer = (id: string) => remove(SRC.engineer, id)

// ── 機器情報 ──
export const getEquipment = () => list(SRC.equipment)
export const createEquipment = (d: Rec) => create(SRC.equipment, d)
export const updateEquipment = (id: string, d: Rec) => update(SRC.equipment, id, d)
export const deleteEquipment = (id: string) => remove(SRC.equipment, id)

// ── 保守契約 ──
export const getContracts = () => list(SRC.contract)
export const createContract = (d: Rec) => create(SRC.contract, d)
export const updateContract = (id: string, d: Rec) => update(SRC.contract, id, d)
export const deleteContract = (id: string) => remove(SRC.contract, id)

// ── コール ──
export const getCalls = () => list(SRC.call)
export const createCall = (d: Rec) => create(SRC.call, d)
export const updateCall = (id: string, d: Rec) => update(SRC.call, id, d)
export const deleteCall = (id: string) => remove(SRC.call, id)

// ── 作業オーダー ──
export const getWorkOrders = () => list(SRC.workorder)
export const createWorkOrder = (d: Rec) => create(SRC.workorder, d)
export const updateWorkOrder = (id: string, d: Rec) => update(SRC.workorder, id, d)
export const deleteWorkOrder = (id: string) => remove(SRC.workorder, id)

// ── 保守レポート（修理履歴）──
export const getReports = () => list(SRC.report)
export const createReport = (d: Rec) => create(SRC.report, d)
export const updateReport = (id: string, d: Rec) => update(SRC.report, id, d)
export const deleteReport = (id: string) => remove(SRC.report, id)

// ── 日報 ──
export const getDailyReports = () => list(SRC.dailyreport)
export const createDailyReport = (d: Rec) => create(SRC.dailyreport, d)
export const updateDailyReport = (id: string, d: Rec) => update(SRC.dailyreport, id, d)
export const deleteDailyReport = (id: string) => remove(SRC.dailyreport, id)

// ── 消費実績 ──
export const getConsumptions = () => list(SRC.consumption)
export const createConsumption = (d: Rec) => create(SRC.consumption, d)
export const updateConsumption = (id: string, d: Rec) => update(SRC.consumption, id, d)
export const deleteConsumption = (id: string) => remove(SRC.consumption, id)

// ── 年間KPI ──
export const getKpis = () => list(SRC.kpi)
export const createKpi = (d: Rec) => create(SRC.kpi, d)
export const updateKpi = (id: string, d: Rec) => update(SRC.kpi, id, d)
export const deleteKpi = (id: string) => remove(SRC.kpi, id)

// ── 改善提案 ──
export const getRecommendations = () => list(SRC.recommendation)
export const createRecommendation = (d: Rec) => create(SRC.recommendation, d)
export const updateRecommendation = (id: string, d: Rec) => update(SRC.recommendation, id, d)
export const deleteRecommendation = (id: string) => remove(SRC.recommendation, id)

// ── エリア ──
export const getAreas = () => list(SRC.area)
export const createArea = (d: Rec) => create(SRC.area, d)
export const updateArea = (id: string, d: Rec) => update(SRC.area, id, d)
export const deleteArea = (id: string) => remove(SRC.area, id)

// ── SystemUsers ──
export const getSystemUsers = () => list("systemusers", {
  filter: "isdisabled eq false",
  select: ["systemuserid", "fullname", "internalemailaddress"],
})

// ── ログインユーザー ──
export async function getCurrentUserId(): Promise<string | null> {
  const context = await getContext()
  if (context.user.systemUserId) return context.user.systemUserId.toLowerCase()
  const entraId = context.user.objectId
  if (!entraId) throw new Error("ログインユーザーの ID を取得できません。")
  const rows = await list("systemusers", {
    select: ["systemuserid"],
    filter: `azureactivedirectoryobjectid eq ${entraId}`,
    top: 1,
  })
  const id = rows[0]?.systemuserid
  if (typeof id !== "string") throw new Error("ログインユーザーに対応する Dataverse ユーザーが見つかりません。")
  return id.toLowerCase()
}
