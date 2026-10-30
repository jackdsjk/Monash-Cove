import { DeleteOutlined } from "@ant-design/icons";
import { Alert, App as AntApp, Badge, Button, Card, Descriptions, Input, Popconfirm, Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import FullSyncCard from "../components/FullSyncCard";
import { fetchRuntimeStatus, fetchSources } from "../data/repository";
import { useDemoStore } from "../state/DemoStateContext";
import type { RuntimeStatus } from "../types";
import { REGION_OPTIONS, loadRegion, saveRegion, type CampusRegion } from "../lib/region";

export default function SettingsPage() {
  const { message } = AntApp.useApp();
  const { state, reset } = useDemoStore();
  const [itemsCount, setItemsCount] = useState(0);
  const [profileName, setProfileName] = useState(() => window.localStorage.getItem("cove-profile-name") ?? "");
  const [region, setRegion] = useState<CampusRegion>(() => loadRegion() ?? "malaysia");
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSources()
      .then((sources) => {
        if (active) setItemsCount(sources.reduce((total, source) => total + source.itemCount, 0));
      })
      .catch(() => undefined);
    void fetchRuntimeStatus()
      .then((status) => {
        if (active) setRuntime(status);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const saveProfile = () => {
    window.localStorage.setItem("cove-profile-name", profileName.trim());
    saveRegion(region);
    message.success("本地称呼和地区已保存");
  };

  const clear = () => {
    reset();
    window.localStorage.removeItem("cove-profile-name");
    window.localStorage.removeItem("cove-campus-region");
    message.success("本地数据和凭据已清除");
  };

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            本地模式
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            设置
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            控制本地数据和查看数据边界。真实凭据、SQLite 和同步都只在本机；没有云端账号或第三方分析。
          </Typography.Paragraph>
        </div>
      </header>

      <Card className="settings-card" title="个人与地区">
        <div className="settings-profile-row">
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
        <Typography.Paragraph type="secondary" className="settings-note">
          地区用于过滤 Moodle 课程和资料；只保存在本机浏览器。
        </Typography.Paragraph>
      </Card>

      <Card className="settings-card" title="运行环境">
        {runtime ? (
          <>
            <div className="runtime-meta">
              <Tag>{runtime.platform} / {runtime.arch}</Tag>
              <Tag>Node {runtime.node}</Tag>
              {runtime.desktop ? <Tag color="green">桌面 App</Tag> : <Tag>浏览器模式</Tag>}
            </div>
            <div className="runtime-checks">
              {runtime.checks.map((check) => (
                <div className="runtime-row" key={check.id}>
                  <Badge status={check.status === "ok" ? "success" : check.status === "warn" ? "warning" : "error"} />
                  <span className="runtime-label">{check.label}</span>
                  <span className="runtime-detail">{check.detail}</span>
                </div>
              ))}
            </div>
            <Typography.Text type="secondary" className="settings-note">
              数据目录：{runtime.dataDir}
            </Typography.Text>
          </>
        ) : (
          <Typography.Text type="secondary">正在检查运行环境…</Typography.Text>
        )}
      </Card>

      <FullSyncCard />

      <Card title="本地数据">
        <Descriptions
          size="small"
          column={2}
          colon={false}
          items={[
            { key: "items", label: "本地条目", children: `${itemsCount} 条` },
            { key: "window", label: "查看窗口", children: state.windowHours === 0 ? "上次查看后（无新内容）" : `${state.windowHours} 小时` },
            { key: "corrections", label: "纠错记录", children: `${Object.keys(state.corrections).length} 条` },
            { key: "read", label: "已读条目", children: `${Object.keys(state.read).length} 条` },
          ]}
        />
        <Space className="settings-actions" wrap>
          <Popconfirm title="清除全部本地数据？" description="会删除条目、纠错、已读，并断开 Gmail/Ed/Moodle、删除本机凭据。此操作不可撤销。" okText="清除" cancelText="取消" onConfirm={clear}>
            <Button danger icon={<DeleteOutlined />}>
              清除全部本地数据
            </Button>
          </Popconfirm>
          <Tag>SQLite + Keychain</Tag>
        </Space>
      </Card>

      <Card className="info-card" title="边界">
        <Alert
          type="warning"
          showIcon
          message="真实数据只在本机"
          description="当前三个来源均已真实连接。清除后会断开来源并删除本机凭据；未连接来源才会显示匿名样本。"
        />
        <Typography.Paragraph type="secondary" className="settings-note">
          产品不会自动提交作业、回复教师或代表用户发消息。高风险结论必须能回到原文。
        </Typography.Paragraph>
      </Card>
    </>
  );
}
