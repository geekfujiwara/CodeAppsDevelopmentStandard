import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getProjects, createProject, updateProject, deleteProject,
  getTasks, createTask, updateTask, deleteTask,
  getMembers, createMember, updateMember, deleteMember,
  getCurrentUserId,
} from "@/services/dataverse-service"

// Projects
export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: getProjects })
}
export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  })
}
export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateProject(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  })
}
export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  })
}

// Tasks
export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: getTasks })
}
export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }) },
  })
}
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateTask(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  })
}
export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  })
}

// Members
export function useMembers() {
  return useQuery({ queryKey: ["members"], queryFn: getMembers })
}
export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  })
}
export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateMember(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  })
}
export function useDeleteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
