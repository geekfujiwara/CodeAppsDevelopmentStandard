import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getSites, createSite, updateSite, deleteSite,
  getPunchItems, createPunchItem, updatePunchItem, deletePunchItem,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useSites() {
  return useQuery({ queryKey: ["sites"], queryFn: getSites })
}
export function useCreateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  })
}
export function useUpdateSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateSite(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  })
}
export function useDeleteSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  })
}

export function usePunchItems() {
  return useQuery({ queryKey: ["punch_items"], queryFn: getPunchItems })
}
export function useCreatePunchItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPunchItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["punch_items"] }),
  })
}
export function useUpdatePunchItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updatePunchItem(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["punch_items"] }),
  })
}
export function useDeletePunchItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deletePunchItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["punch_items"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
