import { useEffect, useState, type ReactNode } from "react";
import { ApiOutlined, BookOutlined, CheckSquareOutlined, ClockCircleOutlined, InboxOutlined, ReadOutlined, SettingOutlined } from "@ant-design/icons";
import { Badge, Layout, Menu, Space, Typography } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fetchOnTrackAccount, fetchSources, fetchSyncStatus } from "../data/repository";
import CommandPalette from "./CommandPalette";
import UpdateBanner from "./UpdateBanner";
import { SOURCE_LABELS } from "../lib/triage";
import type { OnTrackAccount, Source } from "../types";

const { Sider, Content } = Layout;

const menuItems = [
  { key: "/", icon: <InboxOutlined />, label: "简报" },
  { key: "/deadlines", icon: <ClockCircleOutlined />, label: "倒计时" },
  { key: "/materials", icon: <BookOutlined />, label: "每周资料" },
  { key: "/ed", icon: <ReadOutlined />, label: "Ed 学习" },
  { key: "/attendance", icon: <CheckSquareOutlined />, label: "签到" },
  { key: "/sources", icon: <ApiOutlined />, label: "数据源" },
  { key: "/settings", icon: <SettingOutlined />, label: "设置" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<Source, number>>({ gmail: 0, ed: 0, moodle: 0, ontrack: 0 });
  const [moodleContentCount, setMoodleContentCount] = useState(0);
  const [account, setAccount] = useState<OnTrackAccount | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await fetchSyncStatus();
        if (!status.fullSyncCompleted || status.job?.status === "running") return;
        const key = "cove-last-open-sync";
        const last = Number(window.sessionStorage.getItem(key) ?? 0);
        if (Date.now() - last < 5 * 60_000) return;
        window.sessionStorage.setItem(key, String(Date.now()));
        for (const source of ["gmail", "ed", "moodle", "ontrack"] as const) {
          await fetch("/api/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source }),
          }).catch(() => undefined);
        }
        if (active) await fetchSources();
      } catch {
        // Opening the app should still work when sync is unavailable.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchOnTrackAccount()
      .then((result) => {
        if (active) setAccount(result.connected ? result.account : null);
      })
      .catch(() => {
        if (active) setAccount(null);
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    void fetchSources()
      .then((sources) => {
        if (!active) return;
        const next: Record<Source, number> = { gmail: 0, ed: 0, moodle: 0, ontrack: 0 };
        for (const source of sources) {
          next[source.id] = source.itemCount;
          if (source.id === "moodle") setMoodleContentCount(source.contentCount ?? 0);
        }
        setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const selectedKey = location.pathname === "/" ? "/" : location.pathname;
  const title = location.pathname === "/sources" ? "数据源" : location.pathname === "/settings" ? "设置" : location.pathname === "/deadlines" ? "倒计时" : location.pathname === "/materials" ? "每周资料" : location.pathname === "/ed" ? "Ed 学习" : location.pathname === "/attendance" ? "签到" : location.pathname === "/setup" ? "首次设置" : "简报";

  useEffect(() => {
    document.title = `Monash Cove · ${title}`;
  }, [title]);

  useEffect(() => {
    const syncBreakpoint = () => setCollapsed(window.innerWidth < 992);
    syncBreakpoint();
    window.addEventListener("resize", syncBreakpoint);
    return () => window.removeEventListener("resize", syncBreakpoint);
  }, []);

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        width={232}
        collapsedWidth={72}
        breakpoint="lg"
        collapsed={collapsed}
        onBreakpoint={setCollapsed}
        trigger={null}
        theme="light"
      >
        <div className="sider-inner">
          <Link className="brand" to="/" aria-label="Monash Cove 首页">
            <span className="brand-word">Monash Cove</span>
          </Link>
          <Typography.Text className="sider-kicker" type="secondary">
            校园信息分诊
          </Typography.Text>

          <Menu
            className="app-menu"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />

          <div className="sider-source-panel">
            <Typography.Text className="sider-label" type="secondary">
              今日来源
            </Typography.Text>
            {(Object.keys(counts) as Source[]).map((source) => (
              <div className="sider-source-row" key={source}>
                <span className={`source-dot source-dot--${source}`} />
                <span>{SOURCE_LABELS[source]}</span>
                <span className="sider-source-count">{counts[source]}</span>
                {source === "moodle" && moodleContentCount > 0 ? (
                  <span className="sider-source-extra">资料 {moodleContentCount}</span>
                ) : null}
              </div>
            ))}
            <Badge className="sider-sync" status="success" text="本地数据" />
          </div>

          <div className="sider-footer">
            <Typography.Text type="secondary">Monash Cove v0.1.2</Typography.Text>
            <Typography.Text type="secondary">本地 API · 来源可连接</Typography.Text>
          </div>
        </div>
      </Sider>

      <Layout>
        <Content className="app-content">
          <header className="content-topbar">
            <Typography.Text type="secondary">{title}</Typography.Text>
            <Space size={12} align="center">
              <CommandPalette />
              <button
                type="button"
                className={`account-chip${account ? "" : " account-chip--off"}`}
                onClick={() => navigate("/sources")}
                title={account ? `${account.email} · 在终端运行 ontrack login 可切换账号` : "在终端运行 ontrack login 连接 OnTrack"}
              >
                <span className={`source-dot source-dot--${account ? "ontrack" : "off"}`} />
                {account ? (
                  <>
                    <span className="account-chip__name">
                      {`${account.firstName} ${account.lastName}`.trim() || account.username}
                    </span>
                    <span className="account-chip__meta">OnTrack</span>
                  </>
                ) : (
                  <span className="account-chip__name">OnTrack 未连接</span>
                )}
              </button>
              <Typography.Text type="secondary">本地模式 · 仅本机存储</Typography.Text>
            </Space>
          </header>
          <div className="page-container">
            <UpdateBanner />
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
