import { useEffect, useState, type ReactNode } from "react"
import { MessageCircle } from "lucide-react"
import { useLocation } from "react-router-dom"
import { PlantAgentPanel } from "@/components/plant-agent-panel"
import { PlantAgentDockContext, type DockRegistration } from "@/hooks/use-plant-agent-dock"

export function PlantAgentDockProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<DockRegistration | null>(null)

  return (
    <PlantAgentDockContext.Provider value={setRegistration}>
      {children}
      <PlantAgentDock registration={registration} />
    </PlantAgentDockContext.Provider>
  )
}

function PlantAgentDock({ registration }: { registration: DockRegistration | null }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const current = !!registration?.active && registration.ownerPath === pathname

  useEffect(() => {
    setOpen(false)
    setMinimized(!current)
  }, [pathname, current])

  if (!registration || !current) return null

  return (
    <aside className={`agent-dock-shell ${current ? "is-current" : ""} ${open ? "is-open" : ""} ${minimized ? "is-minimized" : ""}`} aria-label="Copilot">
      <div className="agent-dock-window">
        <PlantAgentPanel key={pathname} selection={registration.selection} previewImage={registration.previewImage} unavailableReason={registration.unavailableReason} design={registration.design} activity={registration.activity} onMinimize={() => { setOpen(false); setMinimized(true) }} />
      </div>
      <button className="agent-float-button" type="button" aria-label="AI アシスタントを開く" title="AI アシスタントを開く" onClick={() => { setOpen(true); setMinimized(false) }}>
        <MessageCircle aria-hidden="true" />
      </button>
    </aside>
  )
}