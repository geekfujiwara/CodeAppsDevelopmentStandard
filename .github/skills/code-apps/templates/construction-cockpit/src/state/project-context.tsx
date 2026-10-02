import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { ConstructionService } from "@/services/construction-service"
import { ProjectContext, type ProjectContextValue } from "@/state/project-state"

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const query = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })

  useEffect(() => {
    if (!selectedProjectId && query.data?.[0]) setSelectedProjectId(query.data[0].id)
  }, [query.data, selectedProjectId])

  const value = useMemo<ProjectContextValue>(() => ({
    projects: query.data ?? [],
    selectedProject: query.data?.find((project) => project.id === selectedProjectId),
    selectedProjectId,
    setSelectedProjectId,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : undefined,
  }), [query.data, query.error, query.isLoading, selectedProjectId])

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}
