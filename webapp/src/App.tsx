import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import BriefPage from "./pages/BriefPage";
import DeadlinesPage from "./pages/DeadlinesPage";
import MaterialsPage from "./pages/MaterialsPage";
import SourcesPage from "./pages/SourcesPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<BriefPage />} />
        <Route path="/deadlines" element={<DeadlinesPage />} />
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
