import { useEffect } from "react";
import { StoreProvider, useStore } from "./store";
import { navigate, useRoute } from "./lib/router";
import { Shell } from "./components/Shell";
import { ItemDrawer } from "./components/ItemDrawer";
import { CommandPalette } from "./components/CommandPalette";
import { LaunchSummary } from "./components/LaunchSummary";
import { BriefPage } from "./pages/BriefPage";
import { DeadlinesPage } from "./pages/DeadlinesPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { EdPage } from "./pages/EdPage";
import { OnTrackPage } from "./pages/OnTrackPage";
import { AttendancePage } from "./pages/AttendancePage";
import { SourcesPage } from "./pages/SourcesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { GradesPage } from "./pages/GradesPage";
import { ComingSoon } from "./pages/ComingSoon";

function Routes() {
  const route = useRoute();
  const { setupDone, ready } = useStore();

  useEffect(() => {
    if (!ready) return;
    if (!setupDone && route !== "/setup") navigate("/setup");
    if (setupDone && route === "/setup") navigate("/");
  }, [setupDone, ready, route]);

  const page = {
    "/": <BriefPage />,
    "/deadlines": <DeadlinesPage />,
    "/grades": <GradesPage />,
    "/materials": <MaterialsPage />,
    "/ed": <EdPage />,
    "/pack": <ComingSoon title="作业资料包" description="由 Moodle 的作业要求和 Ed 的帖子组成。" />,
    "/ontrack": <OnTrackPage />,
    "/attendance": <AttendancePage />,
    "/sources": <SourcesPage />,
    "/settings": <SettingsPage />,
    "/setup": <ComingSoon title="首次设置" description="连接 Gmail、Ed 与 Moodle，完成首次全量同步。" />,
  }[route];

  return (
    <>
      <Shell route={route}>
        <div key={route} className="page-enter">
          {page}
        </div>
      </Shell>
      <ItemDrawer />
      <CommandPalette />
      <LaunchSummary />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Routes />
    </StoreProvider>
  );
}
