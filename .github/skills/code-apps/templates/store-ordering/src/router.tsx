import { createHashRouter, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import Layout from "@/pages/_layout"

const MenuPage = lazy(() => import("@/pages/menu"))
const OrderEntry = lazy(() => import("@/pages/order-entry"))
const OrderList = lazy(() => import("@/pages/orders"))
const StockPage = lazy(() => import("@/pages/stock"))
const WeatherPage = lazy(() => import("@/pages/weather"))
const NotFound = lazy(() => import("@/pages/not-found"))

// IMPORTANT: Do not remove or modify the code below!
// Normalize URL when hosted in Power Apps (remove trailing index.html)
if (location.pathname.endsWith("/index.html")) {
  const base = new URL(".", location.href).pathname;
  history.replaceState(null, "", base + location.search + location.hash);
}

const loading = <div className="t-loading">読み込み中…</div>

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/menu" replace /> },
      // 業務ページを追加したら、config.ts の NAV_SECTIONS と同じ path でここにも登録する
      { path: "menu", element: <Suspense fallback={loading}><MenuPage /></Suspense> },
      { path: "order", element: <Suspense fallback={loading}><OrderEntry /></Suspense> },
      { path: "orders", element: <Suspense fallback={loading}><OrderList /></Suspense> },
      { path: "stock", element: <Suspense fallback={loading}><StockPage /></Suspense> },
      { path: "weather", element: <Suspense fallback={loading}><WeatherPage /></Suspense> },
      { path: "*", element: <Suspense fallback={loading}><NotFound /></Suspense> },
    ],
  },
])
