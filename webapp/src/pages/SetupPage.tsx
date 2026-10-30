import { useEffect, useState } from "react";
import { Alert, App as AntApp, Button, Card, Col, Input, Progress, Row, Select, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, GoogleOutlined, LockOutlined, LoginOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { fetchMoodleAssistant, fetchMoodleCourses, fetchSetupStatus, fetchSyncStatus, startFullSync, startMoodleAssistant, cancelMoodleAssistant } from "../data/repository";
import type { FullSyncJob, MoodleAssistantState, SetupStatus } from "../types";
import { REGION_LABELS, REGION_OPTIONS, defaultRegionForCourses, loadRegion, saveRegion, type CampusRegion } from "../lib/region";

const EMPTY_SETUP: SetupStatus = {
  gmailConnected: false,
  edConnected: false,
  moodleConnected: false,
  fullSyncCompleted: false,
  setupRequired: true,
};

export default function SetupPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus>(EMPTY_SETUP);
  const [loading, setLoading] = useState(true);
  const [edToken, setEdToken] = useState("");
  const [edSaving, setEdSaving] = useState(false);
  const [assistant, setAssistant] = useState<MoodleAssistantState>({ status: "idle", message: "" });
  const [assistantStarting, setAssistantStarting] = useState(false);
  const [job, setJob] = useState<FullSyncJob | null>(null);
  const [startingFull, setStartingFull] = useState(false);
  const [profileName, setProfileName] = useState(() => window.localStorage.getItem("cove-profile-name") ?? "");
  const [region, setRegion] = useState<CampusRegion>(() => loadRegion() ?? "malaysia");
  const [detectedRegion, setDetectedRegion] = useState<CampusRegion | null>(null);
  const hasSavedRegion = loadRegion() !== null;

  const refresh = async () => {
    try {
      setStatus(await fetchSetupStatus());
    } catch {
      message.error("无法读取首次设置状态");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!status.moodleConnected) return;
    let active = true;
    void fetchMoodleCourses()
      .then((courses) => {
        if (!active || courses.length === 0) return;
        const detected = defaultRegionForCourses(courses);
        setDetectedRegion(detected);
        if (!loadRegion()) {
          setRegion(detected);
          saveRegion(detected);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [status.moodleConnected]);

  useEffect(() => {
    if (assistant.status !== "waiting_login") return;
    const timer = window.setInterval(() => {
      void fetchMoodleAssistant().then((next) => {
        setAssistant(next);
        if (next.status === "connected") {
          message.success("Moodle 已连接，session 已保存到本机");
          void refresh();
        }
      }).catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [assistant.status]);

  const connectGmail = async () => {
    const response = await fetch("/api/oauth/google/start");
    const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.url) {
      message.warning(body?.error?.message ?? "Google OAuth 尚未配置；管理员需要先配置 OAuth client");
      return;
    }
    window.location.href = body.url;
  };

  const saveEd = async () => {
    if (!edToken.trim()) return;
    setEdSaving(true);
    try {
      const response = await fetch("/api/sources/ed/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: edToken.trim(), region: "au" }),
      });
      if (!response.ok) throw new Error("Ed token 保存失败");
      setEdToken("");
      await refresh();
      message.success("Ed 已连接");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Ed token 保存失败");
    } finally {
      setEdSaving(false);
    }
  };

  const startMoodle = async () => {
    setAssistantStarting(true);
    try {
      setAssistant(await startMoodleAssistant());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Moodle 登录助手启动失败");
    } finally {
      setAssistantStarting(false);
    }
  };

  const cancelMoodle = async () => {
    setAssistant(await cancelMoodleAssistant());
  };

  const runFullSync = async () => {
    setStartingFull(true);
    try {
      const next = await startFullSync();
      if (next) setJob(next);
      for (let attempt = 0; attempt < 1200; attempt += 1) {
        const current = await fetchSyncStatus();
        setJob(current.job);
        if (current.fullSyncCompleted) {
          await refresh();
          message.success("全量同步完成");
          navigate("/");
          return;
        }
        if (current.job?.status === "error") throw new Error("全量同步部分失败，请查看数据源页");
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      throw new Error("全量同步等待超时");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "全量同步失败");
    } finally {
      setStartingFull(false);
    }
  };

  const skip = () => {
    window.localStorage.setItem("cove-setup-skipped", "1");
    navigate("/");
  };

  const saveProfile = () => {
    window.localStorage.setItem("cove-profile-name", profileName.trim());
    saveRegion(region);
    message.success("本地称呼和地区已保存");
  };

  if (loading) return <div className="setup-loading">正在检查首次设置…</div>;

  const allConnected = status.gmailConnected && status.edConnected && status.moodleConnected;
  const assistantRunning = assistant.status === "waiting_login";

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            FIRST RUN
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            欢迎使用 Cove
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            先连接你自己的校园账号。Cove 不保存密码；登录由 Gmail、Ed 和 Monash 官方页面完成，凭据只留在本机 Keychain。
          </Typography.Paragraph>
        </div>
        <Button type="text" onClick={skip}>
          先使用匿名样例
        </Button>
      </header>

      {status.fullSyncCompleted ? (
        <Alert
          className="page-alert"
          type="success"
          showIcon
          message="首次设置已完成"
          description="三个来源已连接，全量同步已完成。以后打开 App 会做增量同步。"
          action={<Button type="primary" onClick={() => navigate("/")}>进入简报</Button>}
        />
      ) : null}

      <Card className="setup-profile-card" title="本地称呼（可选）">
        <div className="setup-profile-row">
          <Input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Cove 在本机怎么称呼你"
            maxLength={40}
          />
          <Select
            value={region}
            onChange={(value) => { setRegion(value); saveRegion(value); }}
            options={REGION_OPTIONS}
            style={{ width: 132 }}
            aria-label="所在地区"
          />
          <Button onClick={saveProfile}>保存</Button>
        </div>
        <Typography.Paragraph type="secondary" className="setup-note">
          只保存在浏览器 localStorage，用于界面显示；不是登录凭据。
        </Typography.Paragraph>
        {detectedRegion ? (
          <Alert
            type="info"
            showIcon
            className="setup-region-hint"
            message={`检测到你的课程可能属于${REGION_LABELS[detectedRegion]}校区`}
            description={
              hasSavedRegion
                ? `当前保存的地区是${REGION_LABELS[region]}；如果不对，直接改上面的选择。`
                : "已帮你预选，但不会替你锁定；确认或修改后再保存。"
            }
          />
        ) : null}
      </Card>

      <Row className="setup-grid" gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            className="setup-card"
            title={<Space><GoogleOutlined /> Gmail</Space>}
            extra={status.gmailConnected ? <Tag color="green" icon={<CheckCircleOutlined />}>已连接</Tag> : <Tag>未连接</Tag>}
          >
            <Typography.Paragraph type="secondary">
              通过 Google 官方 OAuth 只读连接；Cove 不接触密码。授权后自动刷新 token。
            </Typography.Paragraph>
            <Button type="primary" disabled={status.gmailConnected} onClick={() => void connectGmail()}>
              {status.gmailConnected ? "已连接" : "连接 Gmail"}
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            className="setup-card"
            title={<Space><LoginOutlined /> Ed</Space>}
            extra={status.edConnected ? <Tag color="green" icon={<CheckCircleOutlined />}>已连接</Tag> : <Tag>未连接</Tag>}
          >
            {status.edConnected ? (
              <Typography.Paragraph type="secondary">Ed token 已保存在本机 Keychain。</Typography.Paragraph>
            ) : (
              <>
                <Typography.Paragraph type="secondary">
                  先打开 Ed 登录并创建 API token，然后粘贴一次。Cove 只保存 token，不保存密码。
                </Typography.Paragraph>
                <Space.Compact style={{ width: "100%" }}>
                  <Input.Password
                    value={edToken}
                    onChange={(event) => setEdToken(event.target.value)}
                    placeholder="Ed API token"
                  />
                  <Button type="primary" loading={edSaving} onClick={() => void saveEd()}>
                    保存
                  </Button>
                </Space.Compact>
                <Button type="link" href="https://edstem.org/au/settings/api-tokens" target="_blank" className="setup-link">
                  打开 Ed token 页面
                </Button>
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            className="setup-card"
            title={<Space><LockOutlined /> Moodle</Space>}
            extra={status.moodleConnected ? <Tag color="green" icon={<CheckCircleOutlined />}>已连接</Tag> : <Tag>未连接</Tag>}
          >
            {status.moodleConnected && assistant.status !== "waiting_login" ? (
              <Typography.Paragraph type="secondary">MoodleSession 已保存在本机 Keychain。</Typography.Paragraph>
            ) : (
              <>
                <Typography.Paragraph type="secondary">
                  点击后打开一个本地 Chrome 窗口；完成 Monash 登录后，助手自动捕获 MoodleSession，不需要复制 cookie。
                </Typography.Paragraph>
                {assistantRunning ? (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Alert type="info" showIcon message="请在打开的 Chrome 窗口中完成 Monash 登录" />
                    <Button onClick={() => void cancelMoodle()}>取消登录</Button>
                  </Space>
                ) : (
                  <Button type="primary" loading={assistantStarting} onClick={() => void startMoodle()}>
                    打开 Moodle 登录助手
                  </Button>
                )}
                {assistant.status === "error" ? <Typography.Text type="danger">{assistant.message}</Typography.Text> : null}
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Card className="setup-sync-card" title="最后一步：首次全量同步">
        <Typography.Paragraph type="secondary">
          连接完成后，一次性同步 Gmail 全部邮件、Ed 全部 thread、Moodle 全部课程与资料。之后日常只做增量。
        </Typography.Paragraph>
        {job ? (
          <div className="setup-sync-progress">
            {(["gmail", "ed", "moodle"] as const).map((source) => {
              const progress = job.sources[source];
              const percent = progress.total ? Math.round((progress.processed / progress.total) * 100) : progress.status === "done" ? 100 : 0;
              return (
                <div className="setup-sync-row" key={source}>
                  <span>{source}</span>
                  <Progress percent={percent} size="small" showInfo={false} status={progress.status === "error" ? "exception" : progress.status === "running" ? "active" : "normal"} />
                  <span>{progress.status === "pending" ? "等待" : progress.total ? `${progress.processed}/${progress.total}` : `${progress.processed} 条`}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <Button type="primary" size="large" icon={<ReloadOutlined />} disabled={!allConnected} loading={startingFull || job?.status === "running"} onClick={() => void runFullSync()}>
          {job?.status === "running" ? "全量同步中…" : status.fullSyncCompleted ? "重新全量同步" : "开始首次全量同步"}
        </Button>
        {!allConnected ? <Typography.Text type="secondary" className="setup-note">三个来源都连接后才能开始。</Typography.Text> : null}
      </Card>
    </>
  );
}
