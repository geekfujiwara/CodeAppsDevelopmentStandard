import { NavLink } from "react-router-dom"
import { HardHat, LayoutDashboard, X } from "lucide-react"
import { NAV_SECTIONS, ICON_MAP } from "@/config"
import { cn } from "@/lib/utils"

type SidebarProps = {
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
}

function Navigation({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="メインメニュー">
      {NAV_SECTIONS.map((section) => (
        <section key={section.title} className="mb-7">
          {!collapsed && (
            <h2 className="mb-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-400">
              {section.title}
            </h2>
          )}
          <div className="space-y-1.5">
            {section.items.map((item) => {
              const Icon = ICON_MAP[item.key] ?? LayoutDashboard
              const path = item.path.startsWith("/") ? item.path : `/${item.path}`
              return (
                <NavLink
                  key={item.key}
                  to={path}
                  title={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 items-center rounded-xl border text-sm font-semibold transition-colors",
                      collapsed ? "justify-center px-2" : "gap-3 px-3",
                      isActive
                        ? "border-cyan-300/40 bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/20"
                        : "border-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-800 hover:text-white",
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
                </NavLink>
              )
            })}
          </div>
        </section>
      ))}
    </nav>
  )
}

function SidebarBody({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  return (
    <>
      <div className={cn("flex h-20 items-center border-b border-slate-800 px-4", collapsed ? "justify-center" : "gap-3")}>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-400 text-slate-950">
          <HardHat className="h-6 w-6" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">現場コックピット</p>
            <p className="truncate text-xs text-slate-400">Construction OS</p>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid h-10 w-10 place-items-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="メニューを閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <Navigation collapsed={collapsed} onNavigate={onClose} />
      {!collapsed && (
        <div className="border-t border-slate-800 p-4 text-xs leading-5 text-slate-400">
          工程・安全・日報・重機を一つの画面で管理
        </div>
      )}
    </>
  )
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh min-h-0 flex-col overflow-hidden bg-slate-950 md:flex">
        <SidebarBody collapsed={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[200] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-label="メニューを閉じる"
          />
          <aside className="relative flex h-full w-[min(20rem,88vw)] flex-col overflow-hidden bg-slate-950 shadow-2xl">
            <SidebarBody collapsed={false} onClose={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  )
}
