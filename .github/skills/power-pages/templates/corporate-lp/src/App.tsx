import { HashRouter, Routes, Route } from "react-router-dom";
import { SiteLayout } from "@/components/site-layout";
import { RequireAuth } from "@/components/require-auth";
import HomePage from "@/pages/home";
import ProfilePage from "@/pages/profile";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          {/* プロフィール編集（認証必須・デフォルト実装） */}
          <Route
            path="profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          {/* 追加ページはここに Route を追加 */}
        </Route>
      </Routes>
    </HashRouter>
  );
}
