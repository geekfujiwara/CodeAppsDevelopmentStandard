import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Workbench = lazy(() => import("@/pages/workbench"))
const Tasks     = lazy(() => import("@/pages/tasks"))
const Revisions = lazy(() => import("@/pages/revisions"))
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
      { index: true, element: <Navigate to="/workbench" replace /> },
      { path: "workbench", element: <Suspense fallback={null}><Workbench /></Suspense> },
      { path: "tasks",     element: <Suspense fallback={null}><Tasks /></Suspense>     },
      { path: "revisions", element: <Suspense fallback={null}><Revisions /></Suspense> },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>  },
    ],
  },
])
