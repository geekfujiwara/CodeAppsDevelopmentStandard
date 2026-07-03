import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCourses, createCourse, updateCourse, deleteCourse,
  getEnrollments, createEnrollment, updateEnrollment, deleteEnrollment,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useCourses() {
  return useQuery({ queryKey: ["courses"], queryFn: getCourses })
}
export function useCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCourse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  })
}
export function useUpdateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateCourse(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  })
}
export function useDeleteCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCourse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  })
}

export function useEnrollments() {
  return useQuery({ queryKey: ["enrollments"], queryFn: getEnrollments })
}
export function useCreateEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createEnrollment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }),
  })
}
export function useUpdateEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateEnrollment(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }),
  })
}
export function useDeleteEnrollment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteEnrollment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrollments"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
