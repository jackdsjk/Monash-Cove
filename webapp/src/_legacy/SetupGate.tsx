import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import CoveLoader from "./CoveLoader";
import { fetchSetupStatus } from "../data/repository";

/**
 * First-run gate.
 *
 * It must only redirect once, on the initial app entry, and only when no source
 * has ever been connected. It must not react to every route change: a full sync
 * can still be running while the user opens Brief, Deadlines, Materials or
 * Sources, and those pages must remain usable.
 */
export default function SetupGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSetupStatus()
      .then((status) => {
        if (!active) return;
        const skipped = window.localStorage.getItem("cove-setup-skipped") === "1";
        const neverConnected = !status.gmailConnected && !status.edConnected && !status.moodleConnected;
        // Only the initial root entry should force setup. Other routes are
        // always allowed, even when the first full sync is still in progress.
        if (neverConnected && !skipped && window.location.pathname === "/") {
          navigate("/setup", { replace: true });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (!checked) return <CoveLoader label="正在检查首次设置" />;
  return <>{children}</>;
}
