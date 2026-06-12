import { createHashRouter, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "@/pages/_layout";

const NotFoundPage = lazy(() => import("@/pages/not-found"));

// テーマ固有ページ
const CopilotDashboardPage = lazy(() => import("@/pages/copilot-dashboard"));
const ConversationsPage = lazy(() => import("@/pages/conversations"));
const AgentManagementPage = lazy(() => import("@/pages/agent-management"));

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
// Normalize URL when hosted in Power Apps (remove trailing index.html)
if (location.pathname.endsWith("/index.html")) {
  const base = new URL(".", location.href).pathname;
  history.replaceState(null, "", base + location.search + location.hash);
}

export const router = createHashRouter(
  [
    {
      path: "/",
      element: <Layout showHeader={true} />,
      errorElement: withSuspense(NotFoundPage),
      children: [
        { index: true, element: <Navigate to="/copilot-dashboard" replace /> },
        { path: "copilot-dashboard", element: withSuspense(CopilotDashboardPage) },
        { path: "conversations", element: withSuspense(ConversationsPage) },
        { path: "agent-management", element: withSuspense(AgentManagementPage) },
      ],
    },
  ],
);
