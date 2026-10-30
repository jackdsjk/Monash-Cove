import { App as AntApp, Button, Card, Progress, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchSyncStatus, startFullSync } from "../data/repository";
import { SOURCE_LABELS } from "../lib/triage";
import type { Source, SyncStatus } from "../types";

export default function FullSyncCard() {
  const { message } = AntApp.useApp();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [starting, setStarting] = useState(false);

  const load = async () => {
    try {
      setSyncStatus(await fetchSyncStatus());
    } catch {
      // Keep the last known state.
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (syncStatus?.job?.status !== "running") return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [syncStatus?.job?.status]);

  const start = async () => {
    setStarting(true);
    try {
      const job = await startFullSync();
      setSyncStatus((previous) => ({ fullSyncCompleted: previous?.fullSyncCompleted ?? false, job }));
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "全量同步启动失败");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card className="full-sync-card settings-card" size="small" title="同步">
      <div className="full-sync-header">
        <div>
          <Typography.Title level={3}>
            {syncStatus?.job?.status === "running"
              ? "正在全量同步"
              : syncStatus?.job?.status === "error"
                ? "全量同步未完成"
                : syncStatus?.fullSyncCompleted
                  ? "全量同步已完成"
                  : "首次全量同步"}
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            {syncStatus?.fullSyncCompleted
              ? "Gmail、Ed、Moodle 已全量入库；日常打开 App 会自动做增量同步。"
              : "新用户建议先跑一次全量：Gmail 全部邮件、Ed 全部课程帖子、Moodle 全部课程与资料。之后日常使用增量同步。"}
          </Typography.Paragraph>
        </div>
        <Button type="primary" loading={starting || syncStatus?.job?.status === "running"} onClick={() => void start()}>
          {syncStatus?.job?.status === "running"
            ? "全量同步中…"
            : syncStatus?.fullSyncCompleted
              ? "重新全量同步"
              : "首次全量同步"}
        </Button>
      </div>

      {syncStatus?.job ? (
        <div className="full-sync-progress">
          {(["gmail", "ed", "moodle"] as Source[]).map((source) => {
            const progress = syncStatus.job?.sources[source];
            if (!progress) return null;
            const percent = progress.total ? Math.round((progress.processed / progress.total) * 100) : progress.status === "done" ? 100 : 0;
            return (
              <div className="full-sync-row" key={source}>
                <span className="full-sync-source">{SOURCE_LABELS[source]}</span>
                <Progress
                  percent={percent}
                  size="small"
                  showInfo={false}
                  status={progress.status === "error" ? "exception" : progress.status === "running" ? "active" : "normal"}
                />
                <span className="full-sync-count">
                  {progress.status === "pending" ? "等待" : progress.status === "error" ? progress.message ?? "失败" : progress.total ? `${progress.processed}/${progress.total}` : `${progress.processed} 条`}
                </span>
              </div>
            );
          })}
          {syncStatus.job.status === "done" ? <Typography.Text type="success">全量同步完成，后续会自动走增量。</Typography.Text> : null}
          {syncStatus.job.status === "error" ? <Typography.Text type="danger">部分来源失败；修复后可以重新全量同步。</Typography.Text> : null}
        </div>
      ) : null}
    </Card>
  );
}
