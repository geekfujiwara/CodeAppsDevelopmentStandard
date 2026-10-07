import { createHashRouter } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"
import { DeepLinkRedirect } from "@/components/deep-link-redirect"

const Dashboard = lazy(() => import("@/pages/dashboard"))
const Projects = lazy(() => import("@/pages/projects"))
const ProjectDetail = lazy(() => import("@/pages/project-detail"))
const Blender = lazy(() => import("@/pages/blender"))
const NotFound  = lazy(() => import("@/pages/not-found"))

// IMPORTANT: Do not remove or modify the code below!
// Normalize URL when hosted in Power Apps (remove trailing index.html)
if (location.pathname.endsWith("/index.html")) {
  const base = new URL(".", location.href).pathname;
  history.replaceState(null, "", base + location.search + location.hash);
}

const page = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DeepLinkRedirect /> },
      // 業務ページを追加したら、config.ts の NAV_SECTIONS と同じ path でここにも登録する
      { path: "dashboard", element: page(<Dashboard />) },
      { path: "projects", element: page(<Projects />) },
      { path: "projects/:id", element: page(<ProjectDetail />) },
      { path: "blender", element: page(<Blender />) },
      { path: "*", element: page(<NotFound />) },
    ],
  },
])
