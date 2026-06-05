import { useEffect } from "react";
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import { SiteLayout } from "@/components/site-layout";
import { RequireAuth } from "@/components/require-auth";
import HomePage from "@/pages/home";
import ProfilePage from "@/pages/profile";

/**
 * ログイン後にサーバーから "/" へ戻された際、ログイン前に
 * use-auth.ts が sessionStorage("pp_return_hash") へ保存したルートへ復元する。
 * HashRouter のハッシュ部分はサーバーの returnUrl では保持できないため必須。
 */
function RestoreRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem("pp_return_hash");
      if (saved) sessionStorage.removeItem("pp_return_hash");
    } catch {
      saved = null;
    }
    if (saved) {
      const target = saved.replace(/^#/, ""); // "#/profile" → "/profile"
      if (target && target !== "/") {
        navigate(target, { replace: true });
      }
    }
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <RestoreRoute />
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
