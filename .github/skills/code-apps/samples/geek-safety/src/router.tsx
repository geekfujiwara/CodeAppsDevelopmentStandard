import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard      = lazy(() => import("@/pages/dashboard"))
const Incidents      = lazy(() => import("@/pages/incidents"))
const IncidentDetail = lazy(() => import("@/pages/incident-detail"))
const Actions        = lazy(() => import("@/pages/actions"))
const Reports        = lazy(() => import("@/pages/reports"))
const NotFound       = lazy(() => import("@/pages/not-found"))

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
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard",      element: <Suspense fallback={null}><Dashboard /></Suspense>      },
      { path: "incidents",      element: <Suspense fallback={null}><Incidents /></Suspense>      },
      { path: "incidents/:id",  element: <Suspense fallback={null}><IncidentDetail /></Suspense> },
      { path: "actions",        element: <Suspense fallback={null}><Actions /></Suspense>        },
      { path: "reports",        element: <Suspense fallback={null}><Reports /></Suspense>        },
      { path: "*",              element: <Suspense fallback={null}><NotFound /></Suspense>       },
    ],
  },
])
