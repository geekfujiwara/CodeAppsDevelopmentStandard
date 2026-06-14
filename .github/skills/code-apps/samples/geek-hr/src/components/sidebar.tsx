import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./sidebar-layout";
import { NAV_SECTIONS, ICON_MAP } from "@/config";
import { LayoutDashboard } from "lucide-react";

export function Sidebar() {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebarContext();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      closeMobile();
    }
  }, [isMobile, closeMobile]);

  const positionClasses = "top-16 h-[calc(100vh-4rem)]";

  const navItems = NAV_SECTIONS.map((section) => ({
    category: section.category,
    items: section.items.map((item) => ({
      icon: ICON_MAP[item.iconKey] ?? LayoutDashboard,
      label: item.label,
      path: item.path,
    })),
  }));

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 h-[calc(100vh-4rem)] bg-black/50 z-40 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 bg-[var(--menu-bg)] border-r border-border shadow-lg z-40 transition-all duration-300 ease-in-out flex flex-col overflow-visible",
          isCollapsed ? "w-16" : "w-64",
          "max-md:transition-transform",
          isMobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          positionClasses,
        )}
      >
        <ScrollArea className="flex-1 overflow-visible">
          <nav
            className={cn(
              "space-y-6 overflow-visible",
              isCollapsed ? "p-1" : "p-2",
            )}
          >
            {navItems.map((section, idx) => (
              <div key={idx} className="space-y-1">
                {isCollapsed && idx > 0 && (
                  <div className="mx-2 my-2 border-t border-border" />
                )}

                <div
                  className={cn(
                    "px-3 py-2 transition-all duration-300",
                    isCollapsed
                      ? "opacity-0 h-0 overflow-hidden"
                      : "opacity-100",
                  )}
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.category}
                  </h3>
                </div>

                {section.items.map((item) => {
                  const normalizedPath = item.path
                    ? item.path === "/" || item.path.startsWith("/")
                      ? item.path
                      : `/${item.path}`
                    : undefined;

                  const baseClasses = cn(
                    "flex items-center rounded-lg transition-all duration-200 group relative",
                    isCollapsed
                      ? "mx-2 px-2 py-2.5 justify-center"
                      : "mx-0 px-3 py-2.5 gap-3",
                  );

                  const labelNode = (
                    <span
                      className={cn(
                        "font-medium transition-all duration-300 whitespace-nowrap",
                        isCollapsed
                          ? "opacity-0 w-0 overflow-hidden"
                          : "opacity-100",
                      )}
                    >
                      {item.label}
                    </span>
                  );

                  const tooltipNode = isCollapsed ? (
                    <div className="fixed left-[4.5rem] px-3 py-1.5 bg-popover text-popover-foreground text-sm rounded-md shadow-lg border border-border opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-[200]">
                      {item.label}
                    </div>
                  ) : null;

                  if (!normalizedPath) return null;

                  return (
                    <NavLink
                      key={normalizedPath}
                      to={normalizedPath}
                      end={normalizedPath === "/"}
                      className={({ isActive }) =>
                        cn(
                          baseClasses,
                          "cursor-pointer",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "hover:bg-[var(--accent-hover)]",
                        )
                      }
                      title={isCollapsed ? item.label : undefined}
                      onClick={() => {
                        if (isMobile) closeMobile();
                      }}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {labelNode}
                      {tooltipNode}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}
