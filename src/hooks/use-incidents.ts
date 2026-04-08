/**
 * インシデント管理 — React Query フック
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIncidents,
  getIncident,
  createIncident,
  updateIncident,
  deleteIncident,
  getCategories,
  getLocations,
  getComments,
  createComment,
} from "@/services/incident-service";
import type {
  CreateIncidentPayload,
  UpdateIncidentPayload,
} from "@/lib/incident-types";

// ── インシデント一覧 ────────────────────────────────────

export function useIncidents() {
  return useQuery({
    queryKey: ["incidents"],
    queryFn: getIncidents,
  });
}

// ── インシデント単体 ────────────────────────────────────

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: () => getIncident(id!),
    enabled: !!id,
  });
}

// ── インシデント作成 ────────────────────────────────────

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateIncidentPayload) => createIncident(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

// ── インシデント更新 ────────────────────────────────────

export function useUpdateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateIncidentPayload;
    }) => updateIncident(id, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident", vars.id] });
    },
  });
}

// ── インシデント削除 ────────────────────────────────────

export function useDeleteIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIncident(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

// ── カテゴリ ────────────────────────────────────────────

export function useCategories() {
  return useQuery({
    queryKey: ["incident-categories"],
    queryFn: getCategories,
  });
}

// ── 場所 ────────────────────────────────────────────────

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: getLocations,
  });
}

// ── コメント ────────────────────────────────────────────

export function useComments(incidentId: string | undefined) {
  return useQuery({
    queryKey: ["comments", incidentId],
    queryFn: () => getComments(incidentId!),
    enabled: !!incidentId,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidentId,
      name,
      content,
    }: {
      incidentId: string;
      name: string;
      content: string;
    }) => createComment(incidentId, name, content),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["comments", vars.incidentId] });
    },
  });
}
