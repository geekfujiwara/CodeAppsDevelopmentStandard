import { useState } from "react"
import { NavLink } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Menu, X, Home, BookOpen, ExternalLink, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

export function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  return (
    <>
      {/* ハンバーガーメニューボタン */}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={toggleMenu} 
        className="md:hidden"
        aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* サイドメニュー */}
      <div className={cn(
        "fixed top-0 left-0 h-full w-80 bg-card border-r border-border shadow-xl transform transition-all duration-300 ease-out z-50 md:hidden",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <h2 className="text-lg font-semibold text-foreground">メニュー</h2>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={closeMenu}
              aria-label="メニューを閉じる"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* ナビゲーションリンク */}
          <ScrollArea className="flex-1">
            <nav className="p-4 space-y-2">
              {/* メインナビゲーション */}
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  メインメニュー
                </h3>
                
                <NavLink
                  to="/"
                  end
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <Home className="h-4 w-4" />
                  <span className="font-medium">ホーム</span>
                </NavLink>

                <NavLink
                  to="/guide"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <BookOpen className="h-4 w-4" />
                  <span className="font-medium">このテンプレートの使い方</span>
                </NavLink>

                <NavLink
                  to="/feedback"
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="font-medium">フィードバック</span>
                </NavLink>
              </div>

              {/* 外部リンクセクション */}
              <div className="border-t border-border pt-4 mt-4 space-y-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  外部リンク
                </h3>

                <a
                  href="https://github.com/microsoft/PowerAppsCodeApps"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="font-medium flex-1">Power Apps Code Apps</span>
                </a>

                <a
                  href="https://react.dev"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="font-medium flex-1">React 公式サイト</span>
                </a>

                <a
                  href="https://github.com/geekfujiwara/CodeAppsDevelopmentStandard"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="font-medium flex-1">Geek開発標準</span>
                </a>
              </div>
            </nav>
          </ScrollArea>

          {/* フッター */}
          <div className="border-t border-border p-4">
            <div className="text-xs text-muted-foreground text-center">
              <p className="font-semibold text-foreground mb-1">Code Apps Starter</p>
              <p>© 2025 Geek Fujiwara</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
