import { createContext, useContext } from "react"
import type { Project } from "@/services/construction-service"

export type ProjectContextValue = {
  projects: Project[]
  selectedProject?: Project
  selectedProjectId: string
  setSelectedProjectId: (id: string) => void
  isLoading: boolean
  error?: Error
}

export const ProjectContext = createContext<ProjectContextValue | null>(null)

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) throw new Error("useProject must be used inside ProjectProvider")
  return context
}
