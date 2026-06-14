import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const Assets    = lazy(() => import("@/pages/assets"))
const Loans     = lazy(() => import("@/pages/loans"))
const Disposal  = lazy(() => import("@/pages/disposal"))
const Inventory = lazy(() => import("@/pages/inventory"))
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
      { path: "dashboard",  element: <Suspense fallback={null}><Dashboard /></Suspense>  },
      { path: "assets",     element: <Suspense fallback={null}><Assets /></Suspense>     },
      { path: "loans",      element: <Suspense fallback={null}><Loans /></Suspense>      },
      { path: "disposal",   element: <Suspense fallback={null}><Disposal /></Suspense>   },
      { path: "inventory",  element: <Suspense fallback={null}><Inventory /></Suspense>  },
      { path: "*",          element: <Suspense fallback={null}><NotFound /></Suspense>    },
    ],
  },
])
