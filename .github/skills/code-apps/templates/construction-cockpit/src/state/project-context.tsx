import { useCallback, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { ConstructionService } from "@/services/construction-service"
import { ProjectContext, type ProjectContextValue } from "@/state/project-state"

const STORAGE_KEY = "construction-cockpit-selected-project"

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "")
  const query = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const setSelectedProjectId = useCallback((id: string) => {
    setSelectedProjectIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }, [])
  // 記憶していた工事が削除済みなら未選択として扱う
  const effectiveId = query.data && !query.data.some((project) => project.id === selectedProjectId) ? "" : selectedProjectId

  const value = useMemo<ProjectContextValue>(() => ({
    projects: query.data ?? [],
    selectedProject: query.data?.find((project) => project.id === effectiveId),
    selectedProjectId: effectiveId,
    setSelectedProjectId,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : undefined,
  }), [effectiveId, query.data, query.error, query.isLoading, setSelectedProjectId])

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}
