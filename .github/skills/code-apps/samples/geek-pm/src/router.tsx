import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const Projects  = lazy(() => import("@/pages/projects"))
const Tasks     = lazy(() => import("@/pages/tasks"))
const Members   = lazy(() => import("@/pages/members"))
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
      { path: "projects",  element: <Suspense fallback={null}><Projects /></Suspense>  },
      { path: "tasks",     element: <Suspense fallback={null}><Tasks /></Suspense>     },
      { path: "members",   element: <Suspense fallback={null}><Members /></Suspense>   },
      { path: "reports",   element: <Suspense fallback={null}><Reports /></Suspense>   },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>   },
    ],
  },
])
