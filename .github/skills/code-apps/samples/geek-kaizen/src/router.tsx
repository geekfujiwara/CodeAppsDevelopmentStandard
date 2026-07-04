import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard   = lazy(() => import("@/pages/dashboard"))
const Board       = lazy(() => import("@/pages/board"))
const Suggestions = lazy(() => import("@/pages/suggestions"))
const Reports     = lazy(() => import("@/pages/reports"))
const NotFound    = lazy(() => import("@/pages/not-found"))

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
      { path: "dashboard",   element: <Suspense fallback={null}><Dashboard /></Suspense>   },
      { path: "board",       element: <Suspense fallback={null}><Board /></Suspense>       },
      { path: "suggestions", element: <Suspense fallback={null}><Suggestions /></Suspense> },
      { path: "reports",     element: <Suspense fallback={null}><Reports /></Suspense>     },
      { path: "*",           element: <Suspense fallback={null}><NotFound /></Suspense>    },
    ],
  },
])
