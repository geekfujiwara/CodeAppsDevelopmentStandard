import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getVehicles, createVehicle, updateVehicle, deleteVehicle,
  getRoutes, createRoute, updateRoute, deleteRoute,
  getStops, createStop, updateStop, deleteStop,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useVehicles() {
  return useQuery({ queryKey: ["vehicles"], queryFn: getVehicles })
}
export function useCreateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createVehicle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  })
}
export function useUpdateVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateVehicle(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  })
}
export function useDeleteVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteVehicle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  })
}

export function useRoutes() {
  return useQuery({ queryKey: ["delivery_routes"], queryFn: getRoutes })
}
export function useCreateRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createRoute,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery_routes"] }),
  })
}
export function useUpdateRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateRoute(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery_routes"] }),
  })
}
export function useDeleteRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteRoute,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery_routes"] }),
  })
}

export function useStops() {
  return useQuery({ queryKey: ["stops"], queryFn: getStops })
}
export function useCreateStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createStop,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stops"] }),
  })
}
export function useUpdateStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateStop(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stops"] }),
  })
}
export function useDeleteStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteStop,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stops"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
