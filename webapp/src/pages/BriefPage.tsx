import { useCallback, useEffect, useMemo, useState } from "react";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, App as AntApp, Button, Card, Col, Collapse, Empty, Input, Row, Segmented, Skeleton, Space, Statistic, Switch, Tag, Typography } from "antd";
import { fetchBrief } from "../data/repository";
import ItemCard from "../components/ItemCard";
import ItemDrawer from "../components/ItemDrawer";
import FeedbackModal from "../components/FeedbackModal";
import { useDemoStore } from "../state/DemoStateContext";
import { filterItems, formatWindow, groupBySection, summarize } from "../lib/triage";
import type { DemoItem, Feedback, Source } from "../types";

type ViewMode = "since" | "all";
type SourceFilter = "all" | Source;

const sourceOptions = [
  { label: "全部", value: "all" },
  { label: "Gmail", value: "gmail" },
  { label: "Ed", value: "ed" },
  { label: "Moodle", value: "moodle" },
];

export default function BriefPage() {
  const { message } = AntApp.useApp();
  const { state, toggleCorrection, saveFeedback, markRead, markChecked, simulateSync } = useDemoStore();
  const [items, setItems] = useState<DemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("since");
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [onlyAction, setOnlyAction] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<DemoItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchBrief());
    } catch {
      setError("无法读取本地演示数据。请重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      filterItems(items, {
        source,
        query,
        onlyAction,
        sinceHours: view === "since" ? state.windowHours : null,
      }),
    [items, onlyAction, query, source, state.windowHours, view],
  );
  const groups = useMemo(() => groupBySection(filtered, state.corrections), [filtered, state.corrections]);
  const summary = useMemo(() => summarize(filtered, state.corrections), [filtered, state.corrections]);
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  const selectedCorrection = selectedId ? state.corrections[selectedId] : undefined;
  const uncertainCount = filtered.filter((item) => item.actionRequired === "uncertain").length;

  const subtitle =
    view === "all"
      ? `共 ${filtered.length} 条匿名样本，按注意力层级分组。`
      : state.windowHours === 0
        ? "上次查看后没有新内容。你可以模拟一次同步，或切换到全部内容。"
        : `过去 ${formatWindow(state.windowHours)}，整理了 ${filtered.length} 条更新，其中 ${summary.action} 条需要你处理。`;

  const openItem = (id: string) => {
    markRead(id);
    setSelectedId(id);
  };

  const handleMarkChecked = () => {
    markChecked(filtered.map((item) => item.id));
    message.success("已记录本次查看，下一次同步会显示新内容");
  };

  const handleSync = () => {
    simulateSync();
    setView("since");
    message.success("已模拟一次同步");
  };

  const handleFeedback = (feedback: Feedback) => {
    if (!feedbackItem) return;
    saveFeedback(feedbackItem.id, feedback);
    message.success("反馈已保存，仅在本机生效");
    setFeedbackItem(null);
  };

  if (loading) {
    return <BriefSkeleton />;
  }

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            {new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            {view === "since" ? "自上次查看" : "全部内容"}
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            {subtitle}
          </Typography.Paragraph>
        </div>
        <Space className="page-actions" wrap>
          <Segmented
            value={view}
            options={[
              { label: "自上次查看", value: "since" },
              { label: "全部", value: "all" },
            ]}
            onChange={(value) => setView(value as ViewMode)}
          />
          <Button icon={<ReloadOutlined />} onClick={handleSync}>
            立即同步
          </Button>
          <Button type="primary" onClick={handleMarkChecked} disabled={view === "all"}>
            标记本次已查看
          </Button>
        </Space>
      </header>

      {error ? (
        <Alert
          className="page-alert"
          type="error"
          showIcon
          message="读取失败"
          description={error}
          action={<Button onClick={() => void load()}>重试</Button>}
        />
      ) : null}

      <Row className="stat-row" gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="本次视图" value={filtered.length} suffix="条" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="必须处理" value={summary.action} suffix="条" styles={{ content: { color: "#CF1322" } }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="待确认" value={uncertainCount} suffix="条" styles={{ content: { color: "#D48806" } }} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="已折叠" value={summary.folded} suffix="条" />
          </Card>
        </Col>
      </Row>

      <div className="toolbar">
        <Segmented
          className="source-filter"
          value={source}
          options={sourceOptions}
          onChange={(value) => setSource(value as SourceFilter)}
        />
        <Input
          className="search-input"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索标题、课程或原文"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="switch-label">
          <Switch checked={onlyAction} onChange={setOnlyAction} />
          只看需要行动
        </label>
      </div>

      {filtered.length === 0 ? (
        <Empty
          className="brief-empty"
          description={
            <div>
              <Typography.Title level={2}>{view === "since" ? "这次巡检没有新内容" : "没有匹配的内容"}</Typography.Title>
              <Typography.Paragraph type="secondary">
                {view === "since" ? "下一次同步后，新内容会出现在这里。" : "调整来源筛选或搜索词后再试。"}
              </Typography.Paragraph>
            </div>
          }
        >
          <Space>
            {view === "since" ? (
              <Button type="primary" onClick={handleSync}>
                模拟一次同步
              </Button>
            ) : null}
            <Button onClick={() => setView("all")}>查看全部内容</Button>
          </Space>
        </Empty>
      ) : (
        <div className="feed">
          {groups.map((group) =>
            group.id === "folded" ? (
              <Collapse
                key={group.id}
                ghost
                className="folded-collapse"
                items={[
                  {
                    key: "folded",
                    label: (
                      <span>
                        已折叠 <Tag>{group.items.length}</Tag>
                      </span>
                    ),
                    children: (
                      <div className="item-list">
                        {group.items.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            correction={state.corrections[item.id] ?? {}}
                            read={Boolean(state.read[item.id])}
                            onOpen={openItem}
                            onTogglePin={(id) => toggleCorrection(id, "pinned")}
                            onDismiss={(id) => toggleCorrection(id, "dismissed")}
                          />
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            ) : (
              <section className={`feed-section feed-section--${group.id}`} key={group.id}>
                <div className="section-heading">
                  <Typography.Text className="section-kicker" type="secondary">
                    BRIEF
                  </Typography.Text>
                  <Typography.Title level={2}>
                    {group.title} <Tag>{group.items.length}</Tag>
                  </Typography.Title>
                  <Typography.Text type="secondary">{group.note}</Typography.Text>
                </div>
                <div className="item-list">
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      correction={state.corrections[item.id] ?? {}}
                      read={Boolean(state.read[item.id])}
                      onOpen={openItem}
                      onTogglePin={(id) => toggleCorrection(id, "pinned")}
                      onDismiss={(id) => toggleCorrection(id, "dismissed")}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}

      <div className="page-footnote">
        <Typography.Text type="secondary">
          演示数据：55 条匿名改写样本 + 2026-10-29 的 gpt-5.6-luna 预录判断。没有真实账号、真实链接或实时推理。
        </Typography.Text>
      </div>

      <ItemDrawer
        item={selectedItem}
        open={Boolean(selectedItem)}
        correction={selectedCorrection}
        onClose={() => setSelectedId(null)}
        onTogglePin={(id) => toggleCorrection(id, "pinned")}
        onDismiss={(id) => toggleCorrection(id, "dismissed")}
        onFeedback={setFeedbackItem}
      />

      <FeedbackModal
        item={feedbackItem}
        open={Boolean(feedbackItem)}
        existing={feedbackItem ? state.corrections[feedbackItem.id]?.feedback : undefined}
        onCancel={() => setFeedbackItem(null)}
        onSubmit={handleFeedback}
      />
    </>
  );
}

function BriefSkeleton() {
  return (
    <div className="brief-skeleton">
      <Skeleton.Input active className="skeleton-title" />
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
}
