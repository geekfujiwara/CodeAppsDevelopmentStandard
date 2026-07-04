import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getEngineers, createEngineer, updateEngineer, deleteEngineer,
  getEquipment, createEquipment, updateEquipment, deleteEquipment,
  getContracts, createContract, updateContract, deleteContract,
  getCalls, createCall, updateCall, deleteCall,
  getWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder,
  getReports, createReport, updateReport, deleteReport,
  getDailyReports, createDailyReport, updateDailyReport, deleteDailyReport,
  getConsumptions, createConsumption, updateConsumption, deleteConsumption,
  getKpis, createKpi, updateKpi, deleteKpi,
  getRecommendations, createRecommendation, updateRecommendation, deleteRecommendation,
  getAreas, createArea, updateArea, deleteArea,
  getSystemUsers,
  getCurrentUserId,
} from "@/services/dataverse-service"

type IdData = { id: string; data: Record<string, unknown> }
type Rec = Record<string, unknown>

function makeCrud(key: string, list: () => Promise<Rec[]>, create: (d: Rec) => Promise<unknown>, update: (id: string, d: Rec) => Promise<unknown>, remove: (id: string) => Promise<unknown>) {
  const useList = () => useQuery({ queryKey: [key], queryFn: list })
  const useCreate = () => {
    const qc = useQueryClient()
    return useMutation({ mutationFn: create, onSuccess: () => qc.invalidateQueries({ queryKey: [key] }) })
  }
  const useUpdate = () => {
    const qc = useQueryClient()
    return useMutation({ mutationFn: ({ id, data }: IdData) => update(id, data), onSuccess: () => qc.invalidateQueries({ queryKey: [key] }) })
  }
  const useDelete = () => {
    const qc = useQueryClient()
    return useMutation({ mutationFn: remove, onSuccess: () => qc.invalidateQueries({ queryKey: [key] }) })
  }
  return { useList, useCreate, useUpdate, useDelete }
}

const customers = makeCrud("customers", getCustomers, createCustomer, updateCustomer, deleteCustomer)
export const useCustomers = customers.useList
export const useCreateCustomer = customers.useCreate
export const useUpdateCustomer = customers.useUpdate
export const useDeleteCustomer = customers.useDelete

const engineers = makeCrud("engineers", getEngineers, createEngineer, updateEngineer, deleteEngineer)
export const useEngineers = engineers.useList
export const useCreateEngineer = engineers.useCreate
export const useUpdateEngineer = engineers.useUpdate
export const useDeleteEngineer = engineers.useDelete

const equipment = makeCrud("equipment", getEquipment, createEquipment, updateEquipment, deleteEquipment)
export const useEquipment = equipment.useList
export const useCreateEquipment = equipment.useCreate
export const useUpdateEquipment = equipment.useUpdate
export const useDeleteEquipment = equipment.useDelete

const contracts = makeCrud("contracts", getContracts, createContract, updateContract, deleteContract)
export const useContracts = contracts.useList
export const useCreateContract = contracts.useCreate
export const useUpdateContract = contracts.useUpdate
export const useDeleteContract = contracts.useDelete

const calls = makeCrud("calls", getCalls, createCall, updateCall, deleteCall)
export const useCalls = calls.useList
export const useCreateCall = calls.useCreate
export const useUpdateCall = calls.useUpdate
export const useDeleteCall = calls.useDelete

const workOrders = makeCrud("work-orders", getWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder)
export const useWorkOrders = workOrders.useList
export const useCreateWorkOrder = workOrders.useCreate
export const useUpdateWorkOrder = workOrders.useUpdate
export const useDeleteWorkOrder = workOrders.useDelete

const reports = makeCrud("reports", getReports, createReport, updateReport, deleteReport)
export const useReports = reports.useList
export const useCreateReport = reports.useCreate
export const useUpdateReport = reports.useUpdate
export const useDeleteReport = reports.useDelete

const dailyReports = makeCrud("daily-reports", getDailyReports, createDailyReport, updateDailyReport, deleteDailyReport)
export const useDailyReports = dailyReports.useList
export const useCreateDailyReport = dailyReports.useCreate
export const useUpdateDailyReport = dailyReports.useUpdate
export const useDeleteDailyReport = dailyReports.useDelete

const consumptions = makeCrud("consumptions", getConsumptions, createConsumption, updateConsumption, deleteConsumption)
export const useConsumptions = consumptions.useList
export const useCreateConsumption = consumptions.useCreate
export const useUpdateConsumption = consumptions.useUpdate
export const useDeleteConsumption = consumptions.useDelete

const kpis = makeCrud("kpis", getKpis, createKpi, updateKpi, deleteKpi)
export const useKpis = kpis.useList
export const useCreateKpi = kpis.useCreate
export const useUpdateKpi = kpis.useUpdate
export const useDeleteKpi = kpis.useDelete

const recommendations = makeCrud("recommendations", getRecommendations, createRecommendation, updateRecommendation, deleteRecommendation)
export const useRecommendations = recommendations.useList
export const useCreateRecommendation = recommendations.useCreate
export const useUpdateRecommendation = recommendations.useUpdate
export const useDeleteRecommendation = recommendations.useDelete

const areas = makeCrud("areas", getAreas, createArea, updateArea, deleteArea)
export const useAreas = areas.useList
export const useCreateArea = areas.useCreate
export const useUpdateArea = areas.useUpdate
export const useDeleteArea = areas.useDelete

export function useSystemUsers() {
  return useQuery({ queryKey: ["systemusers"], queryFn: getSystemUsers })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUserId"], queryFn: getCurrentUserId, staleTime: Infinity, retry: 2 })
}
