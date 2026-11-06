import { ApiOutlined, CheckCircleOutlined, CopyOutlined, ProfileOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, App as AntApp, Badge, Button, Card, Col, Descriptions, Form, Input, Modal, Row, Select, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import CoveLoader from "../components/CoveLoader";
import { Link } from "react-router-dom";
import { cancelMoodleAssistant, fetchMoodleAssistant, fetchOnTrackAccount, fetchSources, startMoodleAssistant } from "../data/repository";
import { SOURCE_LABELS } from "../lib/triage";
import type { MoodleAssistantState, OnTrackAccount, Source, SourceStatus } from "../types";

const sources: Array<{ source: Source; status: "success" | "warning"; lastSync: string; scope: string }> = [
  { source: "gmail", status: "success", lastSync: "12 分钟前", scope: "只读邮件与线程" },
  { source: "ed", status: "success", lastSync: "18 分钟前", scope: "只读课程讨论" },
  { source: "moodle", status: "warning", lastSync: "2 小时前", scope: "只读 assessment 与公告" },
];

export default function SourcesPage() {
  const { message } = AntApp.useApp();
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [onTrack, setOnTrack] = useState<OnTrackAccount | null>(null);
  const [onTrackChecking, setOnTrackChecking] = useState(false);
  const [connectSource, setConnectSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  const [manualMoodle, setManualMoodle] = useState(false);
  const [moodleAssistant, setMoodleAssistant] = useState<MoodleAssistantState | null>(null);
  const [assistantStarting, setAssistantStarting] = useState(false);

  const loadStatuses = useCallback(async () => {
    try {
      setStatuses(await fetchSources());
    } catch {
      setStatuses([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve(loadStatuses()).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadStatuses]);

  useEffect(() => {
    if (connectSource !== "moodle" || moodleAssistant?.status !== "waiting_login") return;
    const timer = window.setInterval(() => {
      void fetchMoodleAssistant().then((next) => {
        setMoodleAssistant(next);
        if (next.status === "connected") {
          message.success("Moodle 已连接");
          setConnectSource(null);
          void loadStatuses();
        }
      }).catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [connectSource, loadStatuses, message, moodleAssistant?.status]);

  const syncSource = async (source: Source) => {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    });
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
      message.warning(body?.error?.message ?? "同步失败");
      await loadStatuses();
      return;
    }
    message.success(`${SOURCE_LABELS[source]} 同步完成`);
    await loadStatuses();
  };

  const openConnect = (source: Source) => {
    setConnectSource(source);
    setManualMoodle(false);
    form.resetFields();
    if (source === "ed") form.setFieldsValue({ region: "au" });
    if (source === "moodle") {
      form.setFieldsValue({ baseUrl: "https://learning.monash.edu" });
      void fetchMoodleAssistant().then(setMoodleAssistant).catch(() => undefined);
    }
  };

  const startMoodle = async () => {
    setAssistantStarting(true);
    try {
      setMoodleAssistant(await startMoodleAssistant());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "登录助手启动失败");
    } finally {
      setAssistantStarting(false);
    }
  };

  const cancelMoodle = async () => {
    setMoodleAssistant(await cancelMoodleAssistant());
  };

  const saveCredentials = async (values: Record<string, string>) => {
    if (!connectSource) return;
    const response = await fetch(`/api/sources/${connectSource}/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
      message.error(body?.error?.message ?? "保存凭据失败");
      return;
    }
    message.success(`${SOURCE_LABELS[connectSource]} 凭据已保存到本机`);
    setConnectSource(null);
    await loadStatuses();
  };

  const connectGmail = async () => {
    const response = await fetch("/api/oauth/google/start");
    const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.url) {
      message.info(body?.error?.message ?? "Google OAuth 尚未配置");
      return;
    }
    window.location.href = body.url;
  };

  const refreshOnTrack = useCallback(async () => {
    setOnTrackChecking(true);
    try {
      const result = await fetchOnTrackAccount();
      setOnTrack(result.connected ? result.account : null);
    } catch {
      setOnTrack(null);
    } finally {
      setOnTrackChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshOnTrack();
  }, [refreshOnTrack]);

  if (loading) {
    return <CoveLoader label="正在读取本地来源" />;
  }

  const copyLoginCommand = async () => {
    try {
      await navigator.clipboard.writeText("ontrack login");
      message.success("命令已复制，在终端里运行即可");
    } catch {
      message.info("复制失败，请手动输入：ontrack login");
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            本地模式
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            数据源
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            只读连接校园来源，确认同步状态和失败原因。第一版不提供代发消息、提交作业或修改源数据的能力。
          </Typography.Paragraph>
        </div>
      </header>

      <Alert
        className="page-alert"
        type="info"
        showIcon
        message="本地数据源"
        description={<span>真实凭据只写入本机 Keychain；未连接时才使用匿名样本。全量同步和校区设置在 <Link to="/settings">设置</Link>。</span>}
      />

      <Row gutter={[16, 16]}>
        {sources.map((config) => {
          const apiStatus = statuses.find((status) => status.id === config.source);
          const count = apiStatus?.itemCount ?? 0;
          const status = apiStatus?.status === "connected" ? "success" : apiStatus?.status === "error" ? "error" : "default";
          return (
            <Col xs={24} md={8} key={config.source}>
              <Card
                title={
                  <Space>
                    <span className={`source-dot source-dot--${config.source}`} />
                    <span>{SOURCE_LABELS[config.source]}</span>
                  </Space>
                }
                extra={<Badge status={status} text={status === "success" ? "已连接" : apiStatus?.status === "fixture" ? "演示数据" : "需检查"} />}
              >
                <Descriptions
                  size="small"
                  column={1}
                  colon={false}
                  items={[
                    { key: "last", label: "最近同步", children: apiStatus?.lastSyncAt ? new Date(apiStatus.lastSyncAt).toLocaleString("zh-CN") : config.lastSync },
                    {
                      key: "scope",
                      label: "读取范围",
                      children:
                        config.source === "moodle" && apiStatus?.contentCount
                          ? `简报 ${count} 条 · 资料 ${apiStatus.contentCount} 条`
                          : config.scope,
                    },
                    { key: "count", label: "样本数", children: `${count} 条` },
                  ]}
                />
                <Space className="source-actions" wrap>
                  <Tag color="success" icon={<CheckCircleOutlined />}>
                    只读
                  </Tag>
                  {apiStatus?.status !== "connected" ? (
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => (config.source === "gmail" ? void connectGmail() : openConnect(config.source))}
                    >
                      连接 {SOURCE_LABELS[config.source]}
                    </Button>
                  ) : (
                    <Button size="small" onClick={() => openConnect(config.source)}>
                      管理
                    </Button>
                  )}
                  <Button size="small" icon={<ApiOutlined />} onClick={() => void syncSource(config.source)}>
                    立即同步
                  </Button>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        className="source-card ot-login-card"
        title={
          <Space>
            <ProfileOutlined />
            <span>OnTrack</span>
          </Space>
        }
        extra={
          <Badge
            status={onTrack ? "success" : "default"}
            text={onTrack ? "已登录" : "未登录"}
          />
        }
      >
        {onTrack ? (
          <Descriptions
            size="small"
            column={1}
            colon={false}
            items={[
              { key: "who", label: "当前账号", children: `${onTrack.firstName} ${onTrack.lastName}`.trim() || onTrack.username },
              { key: "mail", label: "邮箱", children: onTrack.email },
              {
                key: "expiry",
                label: "会话到期",
                children: onTrack.expiresAt ? new Date(onTrack.expiresAt).toLocaleString("zh-CN") : "由登录助手维护",
              },
            ]}
          />
        ) : (
          <Typography.Paragraph type="secondary" className="ot-login-note">
            还没登录。OnTrack 的登录由本地 CLI 完成，密码和 MFA 都在你自己的终端里输入，不会经过这个页面。
          </Typography.Paragraph>
        )}

        <div className="ot-login-steps">
          <b>怎么登录</b>
          <ol>
            <li>打开终端</li>
            <li>
              运行 <code>ontrack login</code>，在弹出的浏览器里完成 Monash 登录
            </li>
            <li>回到这里点「重新检测」</li>
          </ol>
        </div>

        <Space className="source-actions" wrap>
          <Tag color="success" icon={<CheckCircleOutlined />}>
            只读
          </Tag>
          <Button size="small" icon={<CopyOutlined />} onClick={() => void copyLoginCommand()}>
            复制登录命令
          </Button>
          <Button size="small" icon={<ReloadOutlined />} loading={onTrackChecking} onClick={() => void refreshOnTrack()}>
            重新检测
          </Button>
          {onTrack ? (
            <Button size="small" onClick={() => void syncSource("ontrack" as Source)}>
              立即同步
            </Button>
          ) : null}
        </Space>
      </Card>

      <Modal
        open={Boolean(connectSource)}
        title={connectSource ? `连接 ${SOURCE_LABELS[connectSource]}` : "连接来源"}
        okText="保存到本机"
        cancelText="取消"
        onCancel={() => setConnectSource(null)}
        onOk={() => form.submit()}
        footer={connectSource === "moodle" && !manualMoodle ? null : undefined}
        destroyOnHidden
      >
        {connectSource === "moodle" && !manualMoodle ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              点下面的按钮会打开一个 Chrome 窗口。在窗口里完成 Monash 登录后，助手会自动捕获 cookie 并保存到本机 Keychain，你不需要手动复制任何东西。
            </Typography.Paragraph>
            {moodleAssistant?.status === "waiting_login" ? (
              <Alert type="info" showIcon message="请在打开的 Chrome 窗口完成 Monash 登录" description={moodleAssistant.message} />
            ) : null}
            {moodleAssistant?.status === "error" ? <Alert type="error" showIcon message="连接失败" description={moodleAssistant.message} /> : null}
            <Space wrap>
              {moodleAssistant?.status === "waiting_login" ? (
                <Button danger onClick={() => void cancelMoodle()}>取消登录</Button>
              ) : (
                <Button type="primary" loading={assistantStarting} onClick={() => void startMoodle()}>打开登录助手</Button>
              )}
              <Button type="link" onClick={() => { setManualMoodle(true); form.setFieldsValue({ baseUrl: "https://learning.monash.edu" }); }}>
                改为手动填写 cookie
              </Button>
            </Space>
          </Space>
        ) : null}
        <Form form={form} layout="vertical" onFinish={saveCredentials} requiredMark={false} style={connectSource === "moodle" && !manualMoodle ? { display: "none" } : undefined}>
          {connectSource === "ed" ? (
            <>
              <Form.Item name="token" label="Ed API token" rules={[{ required: true, message: "请输入 token" }]}>
                <Input.Password placeholder="只保存在本机 Keychain" />
              </Form.Item>
              <Form.Item name="region" label="区域" rules={[{ required: true }]}>
                <Select options={[{ value: "us", label: "US" }, { value: "au", label: "AU" }, { value: "eu", label: "EU" }]} />
              </Form.Item>
            </>
          ) : null}
          {connectSource === "moodle" ? (
            <>
              <Form.Item name="baseUrl" label="Moodle 地址" rules={[{ required: true, type: "url", message: "请输入完整 URL" }]}>
                <Input placeholder="https://learning.monash.edu" />
              </Form.Item>
              <Form.Item name="session" label="MoodleSession cookie" rules={[{ required: true, message: "请输入 session" }]}>
                <Input.Password placeholder="只保存在本机 Keychain" />
              </Form.Item>
            </>
          ) : null}
          {connectSource === "gmail" ? (
            <Alert type="info" showIcon message="Gmail 使用 OAuth" description="点击来源卡片的“连接 Gmail”完成授权；这里不保存密码。" />
          ) : null}
        </Form>
      </Modal>

      <Card className="info-card" title="接入边界">
        <Typography.Paragraph type="secondary">
          真实接入时，登录、凭据和同步都在本机完成；页面只读取本地服务整理后的简报。Ed 和 Moodle 的会话、Gmail 的 OAuth
          回调不应暴露给浏览器渲染进程。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          下一步：接入本地 Node 服务，先打通一个来源的纵向切片，再扩展到三个来源。
        </Typography.Paragraph>
      </Card>
    </>
  );
}
