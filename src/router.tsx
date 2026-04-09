import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "@/pages/_layout";

const NotFoundPage = lazy(() => import("@/pages/not-found"));

// インシデント管理ページ
const IncidentListPage = lazy(() => import("@/pages/incidents"));
const IncidentDetailPage = lazy(() => import("@/pages/incident-detail"));

// ローディングコンポーネント
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="flex flex-col items-center gap-2">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      <p className="text-sm text-muted-foreground">読み込み中...</p>
    </div>
  </div>
);

// Suspenseラッパー
const withSuspense = (
  Component: React.LazyExoticComponent<() => React.JSX.Element>,
) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname;
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout showHeader={true} />,
      errorElement: withSuspense(NotFoundPage),
      children: [
        { index: true, element: <Navigate to="/incidents" replace /> },
        { path: "incidents", element: withSuspense(IncidentListPage) },
        { path: "incidents/:id", element: withSuspense(IncidentDetailPage) },
      ],
    },
  ],
  {
    basename: BASENAME, // IMPORTANT: Set basename for proper routing when hosted in Power Apps
  },
);
