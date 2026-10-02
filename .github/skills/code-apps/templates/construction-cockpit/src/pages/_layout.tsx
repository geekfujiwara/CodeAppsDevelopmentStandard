import { useEffect, useState } from "react"
import { Outlet } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Sidebar } from "@/components/sidebar"
import { SidebarProvider, useSidebarContext } from "@/components/sidebar-layout"
import { Menu, RefreshCw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CODEAPPS_APP_NAME, CODEAPPS_APP_SUBTITLE } from "@/config"
import { OnboardingGuide } from "@/components/onboarding-guide"
import { useProject } from "@/state/project-state"

type LayoutProps = { showHeader?: boolean }

function LayoutContent({ showHeader = true }: LayoutProps) {
  const [isMobileView, setIsMobileView] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { isCollapsed, toggleSidebar, toggleMobile, isMobileOpen } = useSidebarContext()
  const queryClient = useQueryClient()
  const { projects, selectedProjectId, setSelectedProjectId, isLoading, error } = useProject()

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    await queryClient.invalidateQueries()
    toast.success("全データを更新しました")
    setIsRefreshing(false)
  }

  useEffect(() => {
    const updateIsMobile = () => setIsMobileView(window.innerWidth < 768)
    updateIsMobile()
    window.addEventListener("resize", updateIsMobile)
    return () => window.removeEventListener("resize", updateIsMobile)
  }, [])

  const handleMenuToggle = () => {
    if (isMobileView) {
      toggleMobile()
    } else {
      toggleSidebar()
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* ヘッダー */}
      {showHeader && (
        <header className="sticky top-0 z-30 w-full border-b border-border bg-[var(--header-bg)] backdrop-blur supports-[backdrop-filter]:bg-[var(--header-bg)]/80 shadow-sm">
          <div className="flex h-16 min-w-0 items-center justify-between gap-2 px-3 sm:px-4">
            {/* 左側: メニューボタンとアプリ名 */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <label className="hidden shrink-0 items-center gap-2 text-sm font-medium lg:flex">
                <span>今の現場</span>
                <select
                  className="h-11 min-w-52 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  aria-label="今の現場を選択"
                  disabled={isLoading || Boolean(error)}
                >
                  <option value="" disabled>{error ? "現場を取得できません" : "現場を選択してください"}</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <OnboardingGuide />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMenuToggle}
                className="flex h-10 w-10 items-center justify-center"
                aria-label={isMobileView
                  ? (isMobileOpen ? "メニューを閉じる" : "メニューを開く")
                  : (isCollapsed ? "サイドバーを展開" : "サイドバーを折りたたむ")}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-primary sm:text-lg">
                  {CODEAPPS_APP_NAME}
                </h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {CODEAPPS_APP_SUBTITLE}
                </p>
              </div>
            </div>

            {/* 右側: 更新ボタン＋テーマ切替 */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                aria-label="全データを更新"
                title="全データを更新"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
              <ModeToggle />
            </div>
          </div>
        </header>
      )}

      <div className="flex flex-1">
        {/* サイドバー */}
        <Sidebar />

        {/* メインコンテンツエリア */}
        <div
          className={`relative z-0 flex min-w-0 flex-1 flex-col transition-[margin,width] duration-300 md:flex-none ${
            isCollapsed
              ? "md:ml-16 md:w-[calc(100%-4rem)]"
              : "md:ml-56 md:w-[calc(100%-14rem)] 2xl:ml-64 2xl:w-[calc(100%-16rem)]"
          }`}
        >
          <main className="flex-1 flex flex-col min-w-0 overflow-visible">
            <div className="flex-1 min-w-0 max-w-full p-3 sm:p-4 lg:p-5 2xl:p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default function Layout(props: LayoutProps) {
  return (
    <SidebarProvider>
      <LayoutContent {...props} />
    </SidebarProvider>
  )
}
