import { useEffect, useState, type ReactNode } from "react";
import { ApiOutlined, InboxOutlined, SettingOutlined } from "@ant-design/icons";
import { Badge, Layout, Menu, Typography } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fetchSources } from "../data/repository";
import { SOURCE_LABELS } from "../lib/triage";
import type { Source } from "../types";

const { Sider, Content } = Layout;

const menuItems = [
  { key: "/", icon: <InboxOutlined />, label: "简报" },
  { key: "/sources", icon: <ApiOutlined />, label: "数据源" },
  { key: "/settings", icon: <SettingOutlined />, label: "设置" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<Source, number>>({ gmail: 0, ed: 0, moodle: 0 });

  useEffect(() => {
    let active = true;
    void fetchSources()
      .then((sources) => {
        if (!active) return;
        const next: Record<Source, number> = { gmail: 0, ed: 0, moodle: 0 };
        for (const source of sources) next[source.id] = source.itemCount;
        setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const selectedKey = location.pathname === "/" ? "/" : location.pathname;
  const title = location.pathname === "/sources" ? "数据源" : location.pathname === "/settings" ? "设置" : "简报";

  useEffect(() => {
    document.title = `Cove · ${title}`;
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
          <Link className="brand" to="/" aria-label="Cove 首页">
            <span className="brand-word">cove</span>
            <span className="brand-dot">.</span>
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
              </div>
            ))}
            <Badge className="sider-sync" status="success" text="本地数据" />
          </div>

          <div className="sider-footer">
            <Typography.Text type="secondary">Cove v0.1</Typography.Text>
            <Typography.Text type="secondary">本地 API · 来源可连接</Typography.Text>
          </div>
        </div>
      </Sider>

      <Layout>
        <Content className="app-content">
          <header className="content-topbar">
            <Typography.Text type="secondary">{title}</Typography.Text>
            <Typography.Text type="secondary">本地模式 · 仅本机存储</Typography.Text>
          </header>
          <div className="page-container">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
