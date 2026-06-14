import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard    = lazy(() => import("@/pages/dashboard"))
const Employees    = lazy(() => import("@/pages/employees"))
const Organization = lazy(() => import("@/pages/organization"))
const Recruitment  = lazy(() => import("@/pages/recruitment"))
const Evaluations  = lazy(() => import("@/pages/evaluations"))
const NotFound     = lazy(() => import("@/pages/not-found"))

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
      { path: "dashboard",    element: <Suspense fallback={null}><Dashboard /></Suspense>    },
      { path: "employees",    element: <Suspense fallback={null}><Employees /></Suspense>    },
      { path: "organization", element: <Suspense fallback={null}><Organization /></Suspense> },
      { path: "recruitment",  element: <Suspense fallback={null}><Recruitment /></Suspense>  },
      { path: "evaluations",  element: <Suspense fallback={null}><Evaluations /></Suspense>  },
      { path: "*",            element: <Suspense fallback={null}><NotFound /></Suspense>      },
    ],
  },
])
