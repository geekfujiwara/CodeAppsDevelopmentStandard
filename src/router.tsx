import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "@/pages/_layout";

const NotFoundPage = lazy(() => import("@/pages/not-found"));

// ダッシュボード
const DashboardPage = lazy(() => import("@/pages/dashboard"));

// 営業管理
const CustomersPage = lazy(() => import("@/pages/customers"));
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail"));
const OpportunitiesPage = lazy(() => import("@/pages/opportunities"));
const OpportunityDetailPage = lazy(() => import("@/pages/opportunity-detail"));
const ActivitiesPage = lazy(() => import("@/pages/activities"));
const PipelinePage = lazy(() => import("@/pages/pipeline"));
const TerritoryPage = lazy(() => import("@/pages/territory"));

// インシデント管理
const IncidentsPage = lazy(() => import("@/pages/incidents"));

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
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: "dashboard", element: withSuspense(DashboardPage) },
        { path: "customers", element: withSuspense(CustomersPage) },
        { path: "customers/:id", element: withSuspense(CustomerDetailPage) },
        { path: "opportunities", element: withSuspense(OpportunitiesPage) },
        {
          path: "opportunities/:id",
          element: withSuspense(OpportunityDetailPage),
        },
        { path: "pipeline", element: withSuspense(PipelinePage) },
        { path: "territory", element: withSuspense(TerritoryPage) },
        { path: "activities", element: withSuspense(ActivitiesPage) },
        { path: "incidents", element: withSuspense(IncidentsPage) },
      ],
    },
  ],
  {
    basename: BASENAME, // IMPORTANT: Set basename for proper routing when hosted in Power Apps
  },
);
