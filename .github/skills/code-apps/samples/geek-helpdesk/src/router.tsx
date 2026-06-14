import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const Tickets   = lazy(() => import("@/pages/tickets"))
const Knowledge = lazy(() => import("@/pages/knowledge"))
const Reports   = lazy(() => import("@/pages/reports"))
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
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <Suspense fallback={null}><Dashboard /></Suspense> },
      { path: "tickets",   element: <Suspense fallback={null}><Tickets /></Suspense>   },
      { path: "knowledge", element: <Suspense fallback={null}><Knowledge /></Suspense> },
      { path: "reports",   element: <Suspense fallback={null}><Reports /></Suspense>   },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>  },
    ],
  },
])
