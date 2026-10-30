import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CoveLoader from "./CoveLoader";
import { fetchSetupStatus } from "../data/repository";

export default function SetupGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSetupStatus()
      .then((status) => {
        if (!active) return;
        const skipped = window.localStorage.getItem("cove-setup-skipped") === "1";
        if (status.setupRequired && !skipped && location.pathname !== "/setup") {
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
  }, [location.pathname, navigate]);

  if (!checked) return <CoveLoader label="正在检查首次设置" />;
  return <>{children}</>;
}
