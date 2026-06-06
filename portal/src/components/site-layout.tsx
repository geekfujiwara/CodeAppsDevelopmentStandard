import { useState, useRef } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import {
  AlertTriangle,
  PlusCircle,
  LogIn,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { LucideIcon } from "lucide-react";

type NavItem = { icon: LucideIcon; label: string; path: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "インシデント",
    items: [
      { icon: AlertTriangle, label: "インシデント一覧", path: "/incidents" },
      { icon: PlusCircle, label: "新規報告", path: "/incidents/new" },
    ],
  },
];

function NavGroupDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  const isGroupActive = group.items.some((item) =>
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
          <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full" />
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

export function SiteLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, login, logout } = useAuth();

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
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-semibold text-foreground hidden sm:block">
                インシデントポータル
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
              {isAuthenticated ? (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {user?.fullName}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="gap-1.5"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    ログアウト
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex gap-1.5"
                  onClick={login}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  ログイン
                </Button>
              )}

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
              {isAuthenticated ? (
                <div className="space-y-2">
                  <p className="px-3 text-xs text-muted-foreground">
                    {user?.fullName}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={logout}
                  >
                    <LogOut className="h-4 w-4" />
                    ログアウト
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  onClick={login}
                >
                  <LogIn className="h-4 w-4" />
                  ログイン
                </Button>
              )}
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
