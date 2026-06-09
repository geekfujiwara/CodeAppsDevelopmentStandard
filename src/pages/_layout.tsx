import { useEffect, useState } from "react"
import { Outlet } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Sidebar } from "@/components/sidebar"
import { SidebarProvider, useSidebarContext } from "@/components/sidebar-layout"
import { CommandPalette } from "@/components/command-palette"
import { QuickActivityFab } from "@/components/quick-activity-fab"
import { Menu, RefreshCw, Search } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CODEAPPS_APP_NAME, CODEAPPS_APP_SUBTITLE } from "@/config"

type LayoutProps = { showHeader?: boolean }

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

            {/* 右側: 検索＋更新ボタン＋テーマ切替 */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
                aria-label="検索 (Ctrl+K)"
                title="検索 (Ctrl+K)"
              >
                <Search className="h-4 w-4" />
              </Button>
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
          <main className="flex-1 flex flex-col overflow-visible">
            <div className="flex-1 p-6 max-w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* グローバルコンポーネント */}
      <CommandPalette />
      <QuickActivityFab />
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
