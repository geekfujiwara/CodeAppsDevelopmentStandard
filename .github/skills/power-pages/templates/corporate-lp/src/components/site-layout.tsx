import { useState, useRef } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  LogIn,
  Menu,
  X,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type NavItem = { icon: LucideIcon; label: string; path: string };
type NavGroup = { label: string; items: NavItem[] };

/**
 * ★ ナビゲーショングループ定義 ★
 * 業務シナリオに合わせてここを編集する。
 * アイコンは lucide-react から選択: https://lucide.dev/icons
 *
 * 例:
 * - ヘルプデスク: チケット / FAQ / ナレッジ
 * - 営業管理: ダッシュボード / 顧客 / 商談 / パイプライン
 * - 社内ポータル: お知らせ / 申請 / マニュアル
 */
const navGroups: NavGroup[] = [
  {
    label: "メイン",
    items: [
      { icon: LayoutDashboard, label: "ホーム", path: "/" },
      { icon: FileText, label: "コンテンツ", path: "/content" },
    ],
  },
  {
    label: "管理",
    items: [
      { icon: Users, label: "ユーザー", path: "/users" },
      { icon: Settings, label: "設定", path: "/settings" },
    ],
  },
];

// Entra ID ログイン URL（Power Pages 標準）
const LOGIN_URL = "/Account/Login";

/** ホバードロップダウン付きグループメニュー */
function NavGroupDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  const isGroupActive = group.items.some(
    (item) =>
      location.pathname === item.path ||
      location.hash.includes(item.path),
  );

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className={cn(
          "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          "hover:bg-primary/8 hover:text-primary",
          isGroupActive ? "text-primary" : "text-muted-foreground",
        )}
      >
        <span>{group.label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        {isGroupActive && (
          <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-linear-to-r from-primary to-accent rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 pt-1 z-50 animate-fade-in">
          <div className="min-w-[180px] rounded-xl border border-border/60 bg-card shadow-premium p-1.5">
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** レスポンシブ: オーバーフロー時に「...」で隠れたグループを表示 */
function OverflowMenu({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className="flex items-center px-2 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-primary/8 hover:text-primary transition-colors"
        aria-label="その他のメニュー"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute top-full right-0 pt-1 z-50 animate-fade-in">
          <div className="min-w-[200px] rounded-xl border border-border/60 bg-card shadow-premium p-1.5">
            {groups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <p className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SiteLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogin = () => {
    window.location.href = LOGIN_URL;
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 w-full bg-(--header-bg)/80 backdrop-blur-xl border-b border-border/50 shadow-premium">
        <div className="header-gradient-line w-full" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* ロゴ */}
            <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">P</span>
              </div>
              <span className="text-base font-semibold text-foreground hidden sm:block">
                Power Pages
              </span>
            </NavLink>

            {/* デスクトップナビ */}
            <nav className="hidden md:flex items-center gap-0.5">
              {navGroups.map((group) => (
                <NavGroupDropdown key={group.label} group={group} />
              ))}
            </nav>

            {/* 右側アクション */}
            <div className="flex items-center gap-2">
              <ModeToggle />
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex gap-1.5"
                onClick={handleLogin}
              >
                <LogIn className="h-3.5 w-3.5" />
                ログイン
              </Button>

              {/* モバイルメニューボタン */}
              <button
                className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="メニュー"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* モバイルメニュー */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[calc(2px+3.5rem)] z-40 bg-background/95 backdrop-blur-sm animate-fade-in">
          <nav className="max-w-7xl mx-auto px-4 py-4 space-y-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            <div className="pt-4 border-t border-border">
              <Button
                variant="default"
                size="sm"
                className="w-full gap-2"
                onClick={handleLogin}
              >
                <LogIn className="h-4 w-4" />
                ログイン
              </Button>
            </div>
          </nav>
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* フッター */}
      <footer className="border-t border-border/50 bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-xs text-muted-foreground">
            Powered by Power Pages
          </p>
        </div>
      </footer>
    </div>
  );
}
