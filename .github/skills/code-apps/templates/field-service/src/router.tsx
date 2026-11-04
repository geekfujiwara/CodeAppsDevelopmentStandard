import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard  = lazy(() => import("@/pages/dashboard"))
const Calls      = lazy(() => import("@/pages/calls"))
const WorkOrders = lazy(() => import("@/pages/work-orders"))
const Reports    = lazy(() => import("@/pages/reports"))
const DailyReports = lazy(() => import("@/pages/daily-reports"))
const ServiceFlow  = lazy(() => import("@/pages/service-flow"))
const AnnualReview = lazy(() => import("@/pages/annual-review"))
const AnnualKpi    = lazy(() => import("@/pages/annual-kpi"))
const Consumption  = lazy(() => import("@/pages/consumption"))
const Recommendations = lazy(() => import("@/pages/recommendations"))
const Knowledge = lazy(() => import("@/pages/knowledge"))
const Customer360 = lazy(() => import("@/pages/customer-360"))
const Customers  = lazy(() => import("@/pages/customers"))
const Equipment  = lazy(() => import("@/pages/equipment"))
const Contracts  = lazy(() => import("@/pages/contracts"))
const Engineers  = lazy(() => import("@/pages/engineers"))
const Scheduling = lazy(() => import("@/pages/scheduling"))
const NotFound   = lazy(() => import("@/pages/not-found"))

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
      { path: "dashboard",   element: <Suspense fallback={null}><Dashboard /></Suspense>  },
      { path: "calls",       element: <Suspense fallback={null}><Calls /></Suspense>      },
      { path: "work-orders", element: <Suspense fallback={null}><WorkOrders /></Suspense> },
      { path: "reports",     element: <Suspense fallback={null}><Reports /></Suspense>    },
      { path: "daily-reports", element: <Suspense fallback={null}><DailyReports /></Suspense> },
      { path: "service-flow",  element: <Suspense fallback={null}><ServiceFlow /></Suspense>  },
      { path: "annual-review",   element: <Suspense fallback={null}><AnnualReview /></Suspense>    },
      { path: "annual-kpi",      element: <Suspense fallback={null}><AnnualKpi /></Suspense>       },
      { path: "consumption",     element: <Suspense fallback={null}><Consumption /></Suspense>     },
      { path: "recommendations", element: <Suspense fallback={null}><Recommendations /></Suspense> },
      { path: "knowledge",       element: <Suspense fallback={null}><Knowledge /></Suspense>       },
      { path: "customer-360", element: <Suspense fallback={null}><Customer360 /></Suspense> },
      { path: "customers",   element: <Suspense fallback={null}><Customers /></Suspense>  },
      { path: "equipment",   element: <Suspense fallback={null}><Equipment /></Suspense>  },
      { path: "contracts",   element: <Suspense fallback={null}><Contracts /></Suspense>  },
      { path: "engineers",   element: <Suspense fallback={null}><Engineers /></Suspense>  },
      { path: "scheduling",  element: <Suspense fallback={null}><Scheduling /></Suspense> },
      { path: "*",           element: <Suspense fallback={null}><NotFound /></Suspense>   },
    ],
  },
])
