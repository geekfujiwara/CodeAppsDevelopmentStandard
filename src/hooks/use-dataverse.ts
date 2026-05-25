import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getTerritories,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  getNewsInsights,
  getCurrentUserId,
} from "@/services/dataverse-service";
import type { CustomerCreate, OpportunityCreate, ActivityCreate, TerritoryCreate } from "@/types/dataverse";

// ── ログインユーザー ID ──
export function useCurrentUserId() {
  return useQuery({
    queryKey: ["currentUserId"],
    queryFn: getCurrentUserId,
    staleTime: Infinity,
  });
}

// ── 顧客 hooks ──
export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerCreate) => createCustomer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomerCreate> }) =>
      updateCustomer(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// ── 商談 hooks ──
export function useOpportunities() {
  return useQuery({
    queryKey: ["opportunities"],
    queryFn: getOpportunities,
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OpportunityCreate) => createOpportunity(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OpportunityCreate> }) =>
      updateOpportunity(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opportunities"] }),
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOpportunity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opportunities"] }),
  });
}

// ── 活動履歴 hooks ──
export function useActivities() {
  return useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ActivityCreate) => createActivity(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ActivityCreate> }) =>
      updateActivity(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
}

// ── テリトリー hooks ──
export function useTerritories() {
  return useQuery({
    queryKey: ["territories"],
    queryFn: getTerritories,
  });
}

export function useCreateTerritory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TerritoryCreate) => createTerritory(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["territories"] }),
  });
}

export function useUpdateTerritory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TerritoryCreate> }) =>
      updateTerritory(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["territories"] }),
  });
}

export function useDeleteTerritory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTerritory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["territories"] }),
  });
}

// ── ニュースインサイト hooks ──
export function useNewsInsights() {
  return useQuery({
    queryKey: ["newsInsights"],
    queryFn: getNewsInsights,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
