import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getEvents, createEvent, updateEvent, deleteEvent,
  getRegistrations, createRegistration, updateRegistration, deleteRegistration,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: getEvents })
}
export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  })
}
export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateEvent(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  })
}
export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  })
}

export function useRegistrations() {
  return useQuery({ queryKey: ["registrations"], queryFn: getRegistrations })
}
export function useCreateRegistration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createRegistration,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registrations"] }),
  })
}
export function useUpdateRegistration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateRegistration(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registrations"] }),
  })
}
export function useDeleteRegistration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteRegistration,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registrations"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
