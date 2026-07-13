import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getRooms, createRoom, updateRoom, deleteRoom,
  getCleaningLogs, createCleaningLog, updateCleaningLog, deleteCleaningLog,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useRooms() {
  return useQuery({ queryKey: ["rooms"], queryFn: getRooms })
}
export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  })
}
export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateRoom(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  })
}
export function useDeleteRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  })
}

export function useCleaningLogs() {
  return useQuery({ queryKey: ["cleaningLogs"], queryFn: getCleaningLogs })
}
export function useCreateCleaningLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCleaningLog,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cleaningLogs"] }),
  })
}
export function useUpdateCleaningLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateCleaningLog(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cleaningLogs"] }),
  })
}
export function useDeleteCleaningLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCleaningLog,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cleaningLogs"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
