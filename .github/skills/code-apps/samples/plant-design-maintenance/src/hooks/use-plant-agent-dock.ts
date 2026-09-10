import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from "react"
import { useLocation } from "react-router-dom"
import type { PlantAgentPanelProps } from "@/components/plant-agent-panel"

export type DockRegistration = PlantAgentPanelProps & { ownerPath: string; active: boolean }
export const PlantAgentDockContext = createContext<Dispatch<SetStateAction<DockRegistration | null>> | null>(null)

export function usePlantAgentDock(props: PlantAgentPanelProps, enabled = true) {
  const setRegistration = useContext(PlantAgentDockContext)
  const { pathname } = useLocation()
  const { selection, previewImage, unavailableReason, design, activity } = props
  const { modelId, modelRevision, nodeId, unitId, partId, label } = selection
  const designJson = design?.json
  const quickReplies = design?.quickReplies
  if (!setRegistration) throw new Error("usePlantAgentDock must be used within PlantAgentDockProvider")

  useEffect(() => {
    setRegistration({ selection: { modelId, modelRevision, nodeId, unitId, partId, label }, previewImage, unavailableReason, activity, design: designJson !== undefined && quickReplies ? { json: designJson, quickReplies } : undefined, ownerPath: pathname, active: enabled })
    return () => setRegistration((current) => current?.ownerPath === pathname ? { ...current, active: false } : current)
  }, [setRegistration, pathname, modelId, modelRevision, nodeId, unitId, partId, label, previewImage, unavailableReason, designJson, quickReplies, activity, enabled])
}