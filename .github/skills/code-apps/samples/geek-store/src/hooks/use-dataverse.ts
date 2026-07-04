import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getStores, createStore, updateStore, deleteStore,
  getAudits, createAudit, updateAudit, deleteAudit,
  getAuditItems, createAuditItem, updateAuditItem, deleteAuditItem,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useStores() {
  return useQuery({ queryKey: ["stores"], queryFn: getStores })
}
export function useCreateStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createStore,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] }),
  })
}
export function useUpdateStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateStore(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] }),
  })
}
export function useDeleteStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteStore,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] }),
  })
}

export function useAudits() {
  return useQuery({ queryKey: ["store_audits"], queryFn: getAudits })
}
export function useCreateAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAudit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_audits"] }),
  })
}
export function useUpdateAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateAudit(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_audits"] }),
  })
}
export function useDeleteAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteAudit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_audits"] }),
  })
}

export function useAuditItems() {
  return useQuery({ queryKey: ["audit_items"], queryFn: getAuditItems })
}
export function useCreateAuditItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAuditItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit_items"] }),
  })
}
export function useUpdateAuditItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateAuditItem(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit_items"] }),
  })
}
export function useDeleteAuditItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteAuditItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit_items"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
