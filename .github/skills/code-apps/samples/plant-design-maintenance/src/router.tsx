import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const Lifecycle = lazy(() => import("@/pages/lifecycle"))
const Drawings  = lazy(() => import("@/pages/drawings"))
const PlantSites = lazy(() => import("@/pages/plant-sites"))
const Traceability = lazy(() => import("@/pages/traceability"))
const Plant3d = lazy(() => import("@/pages/plant-3d"))
const PlantDesigner = lazy(() => import("@/pages/plant-designer"))
const Incidents = lazy(() => import("@/pages/incidents"))
const Knowledge = lazy(() => import("@/pages/knowledge"))
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
      { index: true, element: <Navigate to="/plant-designer" replace /> },
      { path: "dashboard", element: <Suspense fallback={null}><Dashboard /></Suspense> },
      { path: "lifecycle", element: <Suspense fallback={null}><Lifecycle /></Suspense> },
      { path: "drawings",  element: <Suspense fallback={null}><Drawings /></Suspense>  },
      { path: "plant-sites", element: <Suspense fallback={null}><PlantSites /></Suspense> },
      { path: "traceability", element: <Suspense fallback={null}><Traceability /></Suspense> },
      { path: "plant-3d", element: <Suspense fallback={<p role="status">3D モデルを読み込み中...</p>}><Plant3d /></Suspense> },
      { path: "plant-designer", element: <Suspense fallback={<p role="status">設計を読み込み中...</p>}><PlantDesigner /></Suspense> },
      { path: "incidents", element: <Suspense fallback={null}><Incidents /></Suspense> },
      { path: "knowledge", element: <Suspense fallback={null}><Knowledge /></Suspense> },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>  },
    ],
  },
])
