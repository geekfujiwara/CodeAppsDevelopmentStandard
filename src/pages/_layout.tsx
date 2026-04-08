import { useEffect, useState } from "react"
import { Outlet } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Sidebar } from "@/components/sidebar"
import { SidebarProvider, useSidebarContext } from "@/components/sidebar-layout"
import { LinkConfirmModal, useLinkModal } from "@/components/link-confirm-modal"
import { Twitter, Youtube, BookOpen, GraduationCap, Menu } from "lucide-react"

type LayoutProps = { showHeader?: boolean }

function LayoutContent({ showHeader = true }: LayoutProps) {
  const [isMobileView, setIsMobileView] = useState(false)
  const { isCollapsed, toggleSidebar, toggleMobile, isMobileOpen } = useSidebarContext()
  const { modalData, openModal, closeModal } = useLinkModal()

  const handleSocialLink = (url: string, title: string, description: string) => {
    openModal(url, title, description)
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
                  Code Apps Starter
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Power Apps Code Apps
                </p>
              </div>
            </div>

            {/* 右側: 機能ボタン */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSocialLink(
                  "https://github.com/geekfujiwara/CodeAppsDevelopmentStandard",
                  "Geek開発標準",
                  "Power Appsコードアプリ開発のためのコーディング規約とベストプラクティス集"
                )}
                className="hover:bg-accent"
              >
                <img src="./geekkumanomi.svg" className="h-6 w-6" alt="通知" />
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

          <footer className="border-t border-border py-8 bg-card">
          <div className="mx-auto w-full max-w-7xl px-6">
            <div className="flex flex-col items-center space-y-6">
              {/* クレジット */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Created by <span className="font-semibold text-foreground">Geek Fujiwara</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Powered by Power Apps Code Apps
                </p>
              </div>

              {/* ソーシャルリンク */}
              <div className="flex items-center gap-6">
                <button
                  onClick={() => handleSocialLink(
                    "https://x.com/geekfujiwara",
                    "X (Twitter)",
                    "Geek Fujiwaraの公式Xアカウント"
                  )}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="X (Twitter)"
                >
                  <Twitter className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleSocialLink(
                    "https://www.youtube.com/@geekfujiwara",
                    "YouTube",
                    "Geek FujiwaraのYouTubeチャンネル - Microsoft 365やPower Platformの技術解説"
                  )}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="YouTube"
                >
                  <Youtube className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleSocialLink(
                    "https://www.udemy.com/user/gikuhuziwarateng-yuan-hong-dao/",
                    "Udemy",
                    "Geek FujiwaraのUdemyコース - オンライン学習プラットフォーム"
                  )}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Udemy"
                >
                  <GraduationCap className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleSocialLink(
                    "https://www.geekfujiwara.com/",
                    "Geek Fujiwara Blog",
                    "技術ブログ - Microsoft 365やPower Platformに関する最新情報とTips"
                  )}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Blog"
                >
                  <BookOpen className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* リンク確認モーダル */}
          <LinkConfirmModal
            isOpen={modalData.isOpen}
            onClose={closeModal}
            url={modalData.url}
            title={modalData.title}
            description={modalData.description}
          />
        </footer>
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
