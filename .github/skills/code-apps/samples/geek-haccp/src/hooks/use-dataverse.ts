import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCheckpoints, createCheckpoint, updateCheckpoint, deleteCheckpoint,
  getMeasurements, createMeasurement, updateMeasurement, deleteMeasurement,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useCheckpoints() {
  return useQuery({ queryKey: ["checkpoints"], queryFn: getCheckpoints })
}
export function useCreateCheckpoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCheckpoint,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkpoints"] }),
  })
}
export function useUpdateCheckpoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateCheckpoint(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkpoints"] }),
  })
}
export function useDeleteCheckpoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCheckpoint,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkpoints"] }),
  })
}

export function useMeasurements() {
  return useQuery({ queryKey: ["measurements"], queryFn: getMeasurements })
}
export function useCreateMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createMeasurement,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["measurements"] }),
  })
}
export function useUpdateMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateMeasurement(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["measurements"] }),
  })
}
export function useDeleteMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteMeasurement,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["measurements"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
