import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getInspections, createInspection, updateInspection, deleteInspection,
  getDefects, createDefect, updateDefect, deleteDefect,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useInspections() {
  return useQuery({ queryKey: ["inspections"], queryFn: getInspections })
}
export function useCreateInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createInspection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspections"] }),
  })
}
export function useUpdateInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateInspection(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspections"] }),
  })
}
export function useDeleteInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteInspection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inspections"] }),
  })
}

export function useDefects() {
  return useQuery({ queryKey: ["defects"], queryFn: getDefects })
}
export function useCreateDefect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createDefect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  })
}
export function useUpdateDefect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateDefect(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  })
}
export function useDeleteDefect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteDefect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defects"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
