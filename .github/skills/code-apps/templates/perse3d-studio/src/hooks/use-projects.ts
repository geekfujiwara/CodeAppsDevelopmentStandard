import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getRepository } from "@/data"
import type { CommentInput, Project, ProjectComment, ProjectInput } from "@/types/project"

const repo = () => getRepository()

export function useDataMode() {
  return repo().mode
}

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => repo().listProjects() })
}

export function useProject(id: string | undefined) {
  return useQuery({ queryKey: ["project", id], queryFn: () => repo().getProject(id!), enabled: !!id })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => repo().createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Project> }) => repo().updateProject(id, patch),
    onSuccess: p => {
      qc.setQueryData(["project", p.id], p)
      qc.invalidateQueries({ queryKey: ["projects"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo().deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useComments(projectId: string | undefined) {
  return useQuery({ queryKey: ["comments", projectId], queryFn: () => repo().listComments(projectId!), enabled: !!projectId })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CommentInput) => repo().addComment(input),
    onSuccess: c => qc.invalidateQueries({ queryKey: ["comments", c.projectId] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateComment(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ProjectComment> }) => repo().updateComment(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteComment(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo().deleteComment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  })
}
