import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getTickets, createTicket, updateTicket, deleteTicket,
  getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useTickets() {
  return useQuery({ queryKey: ["tickets"], queryFn: getTickets })
}
export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  })
}
export function useUpdateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateTicket(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  })
}
export function useDeleteTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tickets"] }),
  })
}

export function useKnowledge() {
  return useQuery({ queryKey: ["knowledge"], queryFn: getKnowledge })
}
export function useCreateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createKnowledge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  })
}
export function useUpdateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateKnowledge(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  })
}
export function useDeleteKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteKnowledge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
