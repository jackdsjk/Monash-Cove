import { useEffect, useState } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { RocketOutlined } from "@ant-design/icons";
import { fetchUpdateStatus } from "../data/repository";
import type { UpdateStatus } from "../types";

const DISMISSED_KEY = "cove-dismissed-update";
const CHECK_INTERVAL_MS = 15 * 60_000;

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let active = true;
    const check = () => {
      void fetchUpdateStatus()
        .then((next) => {
          if (!active) return;
          const dismissed = window.localStorage.getItem(DISMISSED_KEY);
          setStatus(next.hasUpdate && next.latestVersion !== dismissed ? next : null);
        })
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!status?.latestVersion || !status.releaseUrl) return null;

  const dismiss = () => {
    if (status.latestVersion) window.localStorage.setItem(DISMISSED_KEY, status.latestVersion);
    setStatus(null);
  };

  return (
    <Alert
      className="update-banner"
      type="info"
      showIcon
      icon={<RocketOutlined />}
      message={`Monash Cove ${status.latestVersion} 已发布`}
      description={(
        <Typography.Text type="secondary">
          当前版本 {status.currentVersion}。可以查看更新内容后手动下载；不会自动替换当前版本。
        </Typography.Text>
      )}
      action={(
        <Space size={6}>
          <Button type="primary" size="small" href={status.releaseUrl} target="_blank" rel="noreferrer">
            查看更新
          </Button>
          <Button type="text" size="small" onClick={dismiss}>稍后</Button>
        </Space>
      )}
    />
  );
}
