import { HashRouter, Routes, Route } from "react-router-dom";
import { SiteLayout } from "@/components/site-layout";
import { RequireAuth } from "@/components/require-auth";
import HomePage from "@/pages/home";
import IncidentsPage from "@/pages/incidents";
import IncidentNewPage from "@/pages/incident-new";
import IncidentDetailPage from "@/pages/incident-detail";

export default function App() {
  return (
    <HashRouter>
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
        </Route>
      </Routes>
    </HashRouter>
  );
}
