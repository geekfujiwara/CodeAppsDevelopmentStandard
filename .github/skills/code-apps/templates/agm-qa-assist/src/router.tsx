import { createHashRouter, Navigate, Outlet } from "react-router-dom"
import { lazy, Suspense } from "react"

const Cockpit = lazy(() => import("@/pages/cockpit"))
const NotFound = lazy(() => import("@/pages/not-found"))

// IMPORTANT: Do not remove or modify the code below!
// Normalize URL when hosted in Power Apps (remove trailing index.html)
if (location.pathname.endsWith("/index.html")) {
  const base = new URL(".", location.href).pathname;
  history.replaceState(null, "", base + location.search + location.hash);
}

// 総会中は画面遷移させないため、サイドバーのレイアウトを使わず 1 画面（コックピット）だけを置く（spec/design.md）
export const router = createHashRouter([
  {
    path: "/",
    element: <Outlet />,
    children: [
      { index: true, element: <Navigate to="/cockpit" replace /> },
      { path: "cockpit", element: <Suspense fallback={null}><Cockpit /></Suspense> },
      { path: "*",       element: <Suspense fallback={null}><NotFound /></Suspense> },
    ],
  },
])