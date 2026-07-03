import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getIncidents, createIncident, updateIncident, deleteIncident,
  getActions, createAction, updateAction, deleteAction,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useIncidents() {
  return useQuery({ queryKey: ["incidents"], queryFn: getIncidents })
}
export function useCreateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createIncident,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  })
}
export function useUpdateIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateIncident(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  })
}
export function useDeleteIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteIncident,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  })
}

export function useActions() {
  return useQuery({ queryKey: ["corrective_actions"], queryFn: getActions })
}
export function useCreateAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corrective_actions"] }),
  })
}
export function useUpdateAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateAction(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corrective_actions"] }),
  })
}
export function useDeleteAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteAction,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corrective_actions"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
