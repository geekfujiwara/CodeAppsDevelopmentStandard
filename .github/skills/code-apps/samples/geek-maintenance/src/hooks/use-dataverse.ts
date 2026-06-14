import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getEquipment, createEquipment, updateEquipment, deleteEquipment,
  getWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder,
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useEquipment() {
  return useQuery({ queryKey: ["equipment"], queryFn: getEquipment })
}
export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createEquipment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment"] }),
  })
}
export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateEquipment(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment"] }),
  })
}
export function useDeleteEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment"] }),
  })
}

export function useWorkOrders() {
  return useQuery({ queryKey: ["work-orders"], queryFn: getWorkOrders })
}
export function useCreateWorkOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createWorkOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
  })
}
export function useUpdateWorkOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateWorkOrder(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
  })
}
export function useDeleteWorkOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteWorkOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
  })
}

export function useSchedules() {
  return useQuery({ queryKey: ["schedules"], queryFn: getSchedules })
}
export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  })
}
export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateSchedule(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  })
}
export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
