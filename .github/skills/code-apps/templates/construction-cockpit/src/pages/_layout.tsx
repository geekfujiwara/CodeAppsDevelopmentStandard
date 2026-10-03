import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { Menu, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Sidebar } from "@/components/sidebar"
import { OnboardingGuide } from "@/components/onboarding-guide"
import { CODEAPPS_APP_NAME, CODEAPPS_APP_SUBTITLE } from "@/config"

type LayoutProps = { showHeader?: boolean }

export default function Layout({ showHeader = true }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const queryClient = useQueryClient()
  const location = useLocation()

  useEffect(() => {
    if (/^\/projects\/[^/]+$/.test(location.pathname)) setCollapsed(true)
  }, [location.pathname])

  const refreshAll = async () => {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries()
      toast.success("全データを更新しました")
    } finally {
      setRefreshing(false)
    }
  }

  const toggleNavigation = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((value) => !value)
      return
    }
    setCollapsed((value) => !value)
  }

  return (
    <div
      className={`min-h-dvh bg-slate-100 text-slate-950 transition-[grid-template-columns] dark:bg-slate-950 dark:text-slate-50 md:grid ${
        collapsed ? "md:grid-cols-[4.5rem_minmax(0,1fr)]" : "md:grid-cols-[15rem_minmax(0,1fr)]"
      }`}
    >
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="min-w-0">
        {showHeader && (
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:px-5">
              <Button variant="ghost" size="icon" onClick={toggleNavigation} aria-label="メニューを切り替える">
                <Menu className="h-5 w-5 md:hidden" />
                {collapsed
                  ? <PanelLeftOpen className="hidden h-5 w-5 md:block" />
                  : <PanelLeftClose className="hidden h-5 w-5 md:block" />}
              </Button>

              <div className="min-w-0">
                <h1 className="truncate text-base font-black text-slate-950 dark:text-white">{CODEAPPS_APP_NAME}</h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">{CODEAPPS_APP_SUBTITLE}</p>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <OnboardingGuide />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={refreshAll}
                  disabled={refreshing}
                  aria-label="全データを更新"
                  title="全データを更新"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
                <ModeToggle />
              </div>
            </div>
          </header>
        )}

        <main className="min-w-0 overflow-x-hidden p-3 sm:p-5 xl:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
