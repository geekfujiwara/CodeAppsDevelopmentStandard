import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getContracts, createContract, updateContract, deleteContract,
  getCounterparties, createCounterparty, updateCounterparty, deleteCounterparty,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useContracts() {
  return useQuery({ queryKey: ["contracts"], queryFn: getContracts })
}
export function useCreateContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createContract,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  })
}
export function useUpdateContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateContract(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  })
}
export function useDeleteContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteContract,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  })
}

export function useCounterparties() {
  return useQuery({ queryKey: ["counterparties"], queryFn: getCounterparties })
}
export function useCreateCounterparty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCounterparty,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counterparties"] }),
  })
}
export function useUpdateCounterparty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateCounterparty(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counterparties"] }),
  })
}
export function useDeleteCounterparty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCounterparty,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counterparties"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
