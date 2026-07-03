import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getApprovalRequests, createApprovalRequest, updateApprovalRequest, deleteApprovalRequest,
  getApprovalSteps, createApprovalStep, deleteApprovalStep,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useApprovalRequests() {
  return useQuery({ queryKey: ["approval_requests"], queryFn: getApprovalRequests })
}
export function useCreateApprovalRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createApprovalRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval_requests"] }),
  })
}
export function useUpdateApprovalRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateApprovalRequest(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval_requests"] }),
  })
}
export function useDeleteApprovalRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteApprovalRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval_requests"] }),
  })
}

export function useApprovalSteps() {
  return useQuery({ queryKey: ["approval_steps"], queryFn: getApprovalSteps })
}
export function useCreateApprovalStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createApprovalStep,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval_steps"] }),
  })
}
export function useDeleteApprovalStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteApprovalStep,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval_steps"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
