import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site-layout";
import { RequireAuth } from "@/components/require-auth";
import HomePage from "@/pages/home";
import IncidentsPage from "@/pages/incidents";
import IncidentNewPage from "@/pages/incident-new";
import IncidentDetailPage from "@/pages/incident-detail";
import ProfilePage from "@/pages/profile";

/** Restore hash route saved before SSO redirect */
function RestoreRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    const saved = sessionStorage.getItem("pp_return_hash");
    if (saved) {
      sessionStorage.removeItem("pp_return_hash");
      const path = saved.replace(/^#/, "") || "/";
      navigate(path, { replace: true });
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
          <Route
            path="incidents"
            element={
              <RequireAuth>
                <IncidentsPage />
              </RequireAuth>
            }
          />
          <Route
            path="incidents/new"
            element={
              <RequireAuth>
                <IncidentNewPage />
              </RequireAuth>
            }
          />
          <Route
            path="incidents/:id"
            element={
              <RequireAuth>
                <IncidentDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}
