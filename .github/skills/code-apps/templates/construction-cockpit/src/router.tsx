import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const SiteMap = lazy(() => import("@/pages/site-map"))
const KyActivity = lazy(() => import("@/pages/ky-activity"))
const KyNew = lazy(() => import("@/pages/ky-new"))
const Incidents = lazy(() => import("@/pages/incidents"))
const IncidentNew = lazy(() => import("@/pages/incident-new"))
const DailyReports = lazy(() => import("@/pages/daily-reports"))
const ReportNew = lazy(() => import("@/pages/report-new"))
const Knowledge = lazy(() => import("@/pages/knowledge"))
const Approvals = lazy(() => import("@/pages/approvals"))
const KyDetail = lazy(() => import("@/pages/record-details").then((module) => ({ default: module.KyDetail })))
const IncidentDetail = lazy(() => import("@/pages/record-details").then((module) => ({ default: module.IncidentDetail })))
const ReportDetail = lazy(() => import("@/pages/record-details").then((module) => ({ default: module.ReportDetail })))
const KnowledgeDetail = lazy(() => import("@/pages/record-details").then((module) => ({ default: module.KnowledgeDetail })))
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
      { path: "approvals", element: <Suspense fallback={null}><Approvals /></Suspense> },
      { path: "ky", element: <Suspense fallback={null}><KyActivity /></Suspense> },
      { path: "ky/new", element: <Suspense fallback={null}><KyNew /></Suspense> },
      { path: "ky/:id", element: <Suspense fallback={null}><KyDetail /></Suspense> },
      { path: "incidents", element: <Suspense fallback={null}><Incidents /></Suspense> },
      { path: "incidents/new", element: <Suspense fallback={null}><IncidentNew /></Suspense> },
      { path: "incidents/:id", element: <Suspense fallback={null}><IncidentDetail /></Suspense> },
      { path: "reports", element: <Suspense fallback={null}><DailyReports /></Suspense> },
      { path: "reports/new", element: <Suspense fallback={null}><ReportNew /></Suspense> },
      { path: "reports/:id", element: <Suspense fallback={null}><ReportDetail /></Suspense> },
      { path: "knowledge", element: <Suspense fallback={null}><Knowledge /></Suspense> },
      { path: "knowledge/:id", element: <Suspense fallback={null}><KnowledgeDetail /></Suspense> },
      { path: "equipment", element: <Suspense fallback={null}><Equipment /></Suspense> },
      { path: "projects/:projectId", element: <Suspense fallback={null}><ProjectDetail /></Suspense> },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>  },
    ],
  },
])
