import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCurrentUserId,
  getAssets, createAsset, updateAsset, deleteAsset,
  getLoans, createLoan, updateLoan, deleteLoan, returnLoan,
  getDisposals, createDisposal, updateDisposal, deleteDisposal,
  approveDisposal, completeDisposal,
  getInventoryChecks, createInventoryCheck, updateInventoryCheck, deleteInventoryCheck,
} from "@/services/dataverse-service"

const QK = {
  currentUser:     ["currentUser"]     as const,
  assets:          ["assets"]          as const,
  loans:           ["loans"]           as const,
  disposals:       ["disposals"]       as const,
  inventoryChecks: ["inventoryChecks"] as const,
}

// ── System ────────────────────────────────────────────────────
export function useCurrentUserId() {
  return useQuery({ queryKey: QK.currentUser, queryFn: getCurrentUserId, staleTime: Infinity })
}

// ══════════════════════════════════════════════════════════════
// Assets
// ══════════════════════════════════════════════════════════════
export function useAssets() {
  return useQuery({ queryKey: QK.assets, queryFn: getAssets })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => createAsset(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.assets }),
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) =>
      updateAsset(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.assets }),
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.assets }),
  })
}

// ══════════════════════════════════════════════════════════════
// Loans
// ══════════════════════════════════════════════════════════════
export function useLoans() {
  return useQuery({ queryKey: QK.loans, queryFn: getLoans })
}

export function useCreateLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => createLoan(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.loans }),
  })
}

export function useUpdateLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) =>
      updateLoan(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.loans }),
  })
}

export function useDeleteLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteLoan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.loans }),
  })
}

export function useReturnLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => returnLoan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.loans }),
  })
}

// ══════════════════════════════════════════════════════════════
// Disposals
// ══════════════════════════════════════════════════════════════
export function useDisposals() {
  return useQuery({ queryKey: QK.disposals, queryFn: getDisposals })
}

export function useCreateDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => createDisposal(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.disposals }),
  })
}

export function useUpdateDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) =>
      updateDisposal(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.disposals }),
  })
}

export function useDeleteDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDisposal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.disposals }),
  })
}

export function useApproveDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveDisposal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.disposals }),
  })
}

export function useCompleteDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => completeDisposal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.disposals }),
  })
}

// ══════════════════════════════════════════════════════════════
// InventoryChecks
// ══════════════════════════════════════════════════════════════
export function useInventoryChecks() {
  return useQuery({ queryKey: QK.inventoryChecks, queryFn: getInventoryChecks })
}

export function useCreateInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => createInventoryCheck(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.inventoryChecks }),
  })
}

export function useUpdateInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) =>
      updateInventoryCheck(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.inventoryChecks }),
  })
}

export function useDeleteInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteInventoryCheck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.inventoryChecks }),
  })
}
