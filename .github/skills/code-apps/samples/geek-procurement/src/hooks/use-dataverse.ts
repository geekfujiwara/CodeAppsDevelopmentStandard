import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getPurchaseRequests, createPurchaseRequest, updatePurchaseRequest, deletePurchaseRequest,
  getVendors, createVendor, updateVendor, deleteVendor,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function usePurchaseRequests() {
  return useQuery({ queryKey: ["purchase_requests"], queryFn: getPurchaseRequests })
}
export function useCreatePurchaseRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPurchaseRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_requests"] }),
  })
}
export function useUpdatePurchaseRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updatePurchaseRequest(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_requests"] }),
  })
}
export function useDeletePurchaseRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deletePurchaseRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_requests"] }),
  })
}

export function useVendors() {
  return useQuery({ queryKey: ["vendors"], queryFn: getVendors })
}
export function useCreateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createVendor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  })
}
export function useUpdateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateVendor(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  })
}
export function useDeleteVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
