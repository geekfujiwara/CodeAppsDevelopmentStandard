import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const SiteMap = lazy(() => import("@/pages/site-map"))
const KyActivity = lazy(() => import("@/pages/ky-activity"))
const Incidents = lazy(() => import("@/pages/incidents"))
const DailyReports = lazy(() => import("@/pages/daily-reports"))
const Knowledge = lazy(() => import("@/pages/knowledge"))
const ProjectDetail = lazy(() => import("@/pages/project-detail"))
const Equipment = lazy(() => import("@/pages/equipment"))
const NotFound  = lazy(() => import("@/pages/not-found"))

// IMPORTANT: Do not remove or modify the code below!
// Normalize URL when hosted in Power Apps (remove trailing index.html)
if (location.pathname.endsWith("/index.html")) {
  const base = new URL(".", location.href).pathname;
  history.replaceState(null, "", base + location.search + location.hash);
}

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/site-map" replace /> },
      // 業務ページを追加したら、config.ts の NAV_SECTIONS と同じ path でここにも登録する
      { path: "site-map", element: <Suspense fallback={null}><SiteMap /></Suspense> },
      { path: "projects", element: <Suspense fallback={null}><ProjectDetail /></Suspense> },
      { path: "ky", element: <Suspense fallback={null}><KyActivity /></Suspense> },
      { path: "incidents", element: <Suspense fallback={null}><Incidents /></Suspense> },
      { path: "reports", element: <Suspense fallback={null}><DailyReports /></Suspense> },
      { path: "knowledge", element: <Suspense fallback={null}><Knowledge /></Suspense> },
      { path: "equipment", element: <Suspense fallback={null}><Equipment /></Suspense> },
      { path: "projects/:projectId", element: <Suspense fallback={null}><ProjectDetail /></Suspense> },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>  },
    ],
  },
])
