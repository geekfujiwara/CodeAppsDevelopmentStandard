import { useEffect, useState } from "react"
import { Outlet, useNavigate, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Sidebar } from "@/components/sidebar"
import { SidebarProvider, useSidebarContext } from "@/components/sidebar-layout"
import { Menu, RefreshCw, ArrowLeft, X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CODEAPPS_APP_NAME, CODEAPPS_APP_SUBTITLE } from "@/config"

type LayoutProps = { showHeader?: boolean }

function ReturnToSchedulingButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Hide on scheduling page itself
    if (location.pathname === "/scheduling") {
      sessionStorage.removeItem("returnToScheduling")
      setShow(false)
    } else {
      setShow(sessionStorage.getItem("returnToScheduling") === "true")
    }
  }, [location.pathname])

  if (!show) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-1 bg-primary text-primary-foreground rounded-lg shadow-lg px-3 py-2 animate-in slide-in-from-bottom-4">
      <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/20 gap-1.5" onClick={() => { sessionStorage.removeItem("returnToScheduling"); navigate("/scheduling") }}>
        <ArrowLeft className="h-4 w-4" /> スケジューリングに戻る
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-primary-foreground/70 hover:bg-primary-foreground/20" onClick={() => { sessionStorage.removeItem("returnToScheduling"); setShow(false) }}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function LayoutContent({ showHeader = true }: LayoutProps) {
  const [isMobileView, setIsMobileView] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { isCollapsed, toggleSidebar, toggleMobile, isMobileOpen } = useSidebarContext()
  const queryClient = useQueryClient()

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
          <div className="px-4 flex items-center justify-between h-16">
            {/* 左側: メニューボタンとアプリ名 */}
            <div className="flex items-center gap-3">
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
              <div>
                <h1 className="text-lg font-bold text-primary">
                  {CODEAPPS_APP_NAME}
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {CODEAPPS_APP_SUBTITLE}
                </p>
              </div>
            </div>

            {/* 右側: 更新ボタン＋テーマ切替 */}
            <div className="flex items-center gap-3">
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
        <div className={`flex-1 flex flex-col transition-all duration-300 relative z-0 ${isCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-6 max-w-full overflow-auto">
              <Outlet />
            </div>
          </main>
          <ReturnToSchedulingButton />
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
