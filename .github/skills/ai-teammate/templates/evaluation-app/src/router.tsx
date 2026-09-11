import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const Turns    = lazy(() => import("@/pages/turns"))
const TurnDetail = lazy(() => import("@/pages/turn-detail"))
const MergeTurns = lazy(() => import("@/pages/merge"))
const Trend    = lazy(() => import("@/pages/trend"))
const Rules    = lazy(() => import("@/pages/rules"))
const Skills   = lazy(() => import("@/pages/skills"))
const Feedback = lazy(() => import("@/pages/feedback"))
const AgentBrain = lazy(() => import("@/pages/agent-brain"))
const Security = lazy(() => import("@/pages/security"))
const CommandCenter = lazy(() => import("@/pages/command-center"))
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
      // 業務ページを追加したら、config.ts の NAV_SECTIONS と同じ path でここにも登録する
      { path: "dashboard", element: <Suspense fallback={null}><Dashboard /></Suspense> },
      { path: "turns", element: <Suspense fallback={null}><Turns /></Suspense> },
      { path: "turns/:id", element: <Suspense fallback={null}><TurnDetail /></Suspense> },
      { path: "merge", element: <Suspense fallback={null}><MergeTurns /></Suspense> },
      { path: "trend", element: <Suspense fallback={null}><Trend /></Suspense> },
      { path: "rules", element: <Suspense fallback={null}><Rules /></Suspense> },
      { path: "rules/:id", element: <Suspense fallback={null}><Rules /></Suspense> },
      { path: "skills", element: <Suspense fallback={null}><Skills /></Suspense> },
      { path: "feedback", element: <Suspense fallback={null}><Feedback /></Suspense> },
      { path: "agent-brain", element: <Suspense fallback={null}><AgentBrain /></Suspense> },
      { path: "security", element: <Suspense fallback={null}><Security /></Suspense> },
      { path: "command-center", element: <Suspense fallback={null}><CommandCenter /></Suspense> },
      { path: "*",         element: <Suspense fallback={null}><NotFound /></Suspense>  },
    ],
  },
])
