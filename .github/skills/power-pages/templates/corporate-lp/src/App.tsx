import { HashRouter, Routes, Route } from "react-router-dom";
import { SiteLayout } from "@/components/site-layout";
import HomePage from "@/pages/home";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          {/* 追加ページはここに Route を追加 */}
        </Route>
      </Routes>
    </HashRouter>
  );
}
