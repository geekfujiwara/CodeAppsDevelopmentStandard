import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getSuggestions, createSuggestion, updateSuggestion, deleteSuggestion,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useSuggestions() {
  return useQuery({ queryKey: ["suggestions"], queryFn: getSuggestions })
}
export function useCreateSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSuggestion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  })
}
export function useUpdateSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateSuggestion(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  })
}
export function useDeleteSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSuggestion,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suggestions"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
