import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard     = lazy(() => import("@/pages/dashboard"))
const Products      = lazy(() => import("@/pages/products"))
const StockMovements = lazy(() => import("@/pages/stock-movements"))
const Orders        = lazy(() => import("@/pages/orders"))
const Reports       = lazy(() => import("@/pages/reports"))
const NotFound      = lazy(() => import("@/pages/not-found"))

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
      { path: "products",       element: <Suspense fallback={null}><Products /></Suspense>       },
      { path: "stock-movements",element: <Suspense fallback={null}><StockMovements /></Suspense> },
      { path: "orders",         element: <Suspense fallback={null}><Orders /></Suspense>         },
      { path: "reports",        element: <Suspense fallback={null}><Reports /></Suspense>        },
      { path: "*",              element: <Suspense fallback={null}><NotFound /></Suspense>       },
    ],
  },
])
