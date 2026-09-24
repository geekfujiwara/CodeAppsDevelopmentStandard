import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense, type ReactNode } from "react"
import Layout from "@/pages/_layout"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const MySales = lazy(() => import("@/pages/my-sales"))
const Opportunities = lazy(() => import("@/pages/opportunities"))
const OpportunityDetail = lazy(() => import("@/pages/opportunity-detail"))
const Records = lazy(() => import("@/pages/records"))
const RecordDetail = lazy(() => import("@/pages/record-detail"))
const NotFound = lazy(() => import("@/pages/not-found"))

// IMPORTANT: Do not remove or modify the code below!
// Normalize URL when hosted in Power Apps (remove trailing index.html)
if (location.pathname.endsWith("/index.html")) {
  const base = new URL(".", location.href).pathname;
  history.replaceState(null, "", base + location.search + location.hash);
}

const page = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: page(<Dashboard />) },
      { path: "my", element: page(<MySales />) },
      { path: "opportunities", element: page(<Opportunities />) },
      { path: "opportunities/:id", element: page(<OpportunityDetail />) },
      { path: "leads", element: page(<Records entity="lead" />) },
      { path: "leads/:id", element: page(<RecordDetail entity="lead" />) },
      { path: "activities", element: page(<Records entity="activity" />) },
      { path: "activities/:id", element: page(<RecordDetail entity="activity" />) },
      { path: "accounts", element: page(<Records entity="account" />) },
      { path: "accounts/:id", element: page(<RecordDetail entity="account" />) },
      { path: "contacts", element: page(<Records entity="contact" />) },
      { path: "contacts/:id", element: page(<RecordDetail entity="contact" />) },
      { path: "targets", element: page(<Records entity="target" />) },
      { path: "targets/:id", element: page(<RecordDetail entity="target" />) },
      { path: "*", element: page(<NotFound />) },
    ],
  },
])
