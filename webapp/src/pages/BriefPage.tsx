import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { HistoryOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, App as AntApp, Button, Card, Col, Collapse, Empty, Input, Row, Segmented, Select, Space, Statistic, Switch, Tag, Typography } from "antd";
import { fetchBrief, fetchSyncStatus, startFullSync } from "../data/repository";
import ItemCard from "../components/ItemCard";
import ItemDrawer from "../components/ItemDrawer";
import FeedbackModal from "../components/FeedbackModal";
import CoveLoader from "../components/CoveLoader";
import { useDemoStore } from "../state/DemoStateContext";
import { filterItems, formatWindow, groupBySection, summarize } from "../lib/triage";
import type { BriefItem, Feedback, Source } from "../types";

type ViewMode = "since" | "all";
type SourceFilter = "all" | Source;
type TypeFilter = "all" | "critical" | "important" | "staff" | "material" | "admin" | "folded";

const sourceOptions = [
  { label: "全部", value: "all" },
  { label: "Gmail", value: "gmail" },
  { label: "Ed", value: "ed" },
  { label: "Moodle", value: "moodle" },
];

const typeOptions = [
  { label: "全部类型", value: "all" },
  { label: "必须处理", value: "critical" },
  { label: "重要", value: "important" },
  { label: "教师答复", value: "staff" },
  { label: "学习资料", value: "material" },
  { label: "行政通知", value: "admin" },
  { label: "已折叠", value: "folded" },
];

export default function BriefPage() {
  const { message } = AntApp.useApp();
  const location = useLocation();
  const requestedId = (location.state as { openItemId?: string } | null)?.openItemId;
  const { state, hydrate, toggleCorrection, saveFeedback, markRead, markChecked } = useDemoStore();
  const [items, setItems] = useState<BriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("since");
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [onlyAction, setOnlyAction] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedbackItem, setFeedbackItem] = useState<BriefItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastLimit, setPastLimit] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBrief();
      setItems(data.items);
      hydrate(data.items);
    } catch {
      setError("无法读取本地数据。请确认本地服务正在运行。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!requestedId) return;
    if (!items.some((item) => item.id === requestedId)) return;
    markRead(requestedId);
    setSelectedId(requestedId);
  }, [items, markRead, requestedId]);

  const courseOptions = useMemo(() => {
    const courses = new Set(items.map((item) => item.course || "未归属课程"));
    return [{ label: "全部课程", value: "all" }, ...[...courses].sort().map((course) => ({ label: course, value: course }))];
  }, [items]);

  const matchesExtraFilters = useCallback(
    (item: BriefItem) => {
      if (courseFilter !== "all" && (item.course || "未归属课程") !== courseFilter) return false;
      if (onlyUnread && state.read[item.id]) return false;
      if (typeFilter === "critical" && item.importance !== "critical") return false;
      if (typeFilter === "important" && item.importance !== "important") return false;
      if (typeFilter === "staff" && item.contentType !== "staff_answer") return false;
      if (typeFilter === "material" && item.contentType !== "learning_material") return false;
      if (typeFilter === "admin" && item.contentType !== "administrative") return false;
      if (typeFilter === "folded" && !(item.importance === "skip" || item.importance === "reference" || state.corrections[item.id]?.dismissed)) return false;
      return true;
    },
    [courseFilter, onlyUnread, state.corrections, state.read, typeFilter],
  );

  const filtered = useMemo(
    () =>
      filterItems(items, {
        source,
        query,
        onlyAction,
        sinceHours: view === "since" ? state.windowHours : null,
      }).filter(matchesExtraFilters),
    [items, matchesExtraFilters, onlyAction, query, source, state.windowHours, view],
  );
  const pastItems = useMemo(() => {
    if (view !== "since") return [];
    return filterItems(items, { source, query, onlyAction, sinceHours: null })
      .filter((item) => item.ageHours > state.windowHours)
      .filter(matchesExtraFilters);
  }, [items, matchesExtraFilters, onlyAction, query, source, state.windowHours, view]);
  const groups = useMemo(() => groupBySection(filtered, state.corrections), [filtered, state.corrections]);
  const summary = useMemo(() => summarize(filtered, state.corrections), [filtered, state.corrections]);
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  const selectedCorrection = selectedId ? state.corrections[selectedId] : undefined;
  const uncertainCount = filtered.filter((item) => item.actionRequired === "uncertain").length;
  const activeFilterCount =
    (source !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (courseFilter !== "all" ? 1 : 0) +
    (onlyAction ? 1 : 0) +
    (onlyUnread ? 1 : 0);

  const clearFilters = () => {
    setSource("all");
    setQuery("");
    setTypeFilter("all");
    setCourseFilter("all");
    setOnlyAction(false);
    setOnlyUnread(false);
  };

  const subtitle =
    view === "all"
      ? `共 ${filtered.length} 条，按注意力层级分组。`
      : state.windowHours === 0
        ? "上次查看后没有新内容。过去的内容仍可在下方展开。"
        : `过去 ${formatWindow(state.windowHours)}，整理了 ${filtered.length} 条更新，其中 ${summary.action} 条需要你处理。${pastItems.length > 0 ? ` 另有 ${pastItems.length} 条更早内容可展开。` : ""}`;

  const openItem = (id: string) => {
    markRead(id);
    setSelectedId(id);
  };

  const handleMarkChecked = () => {
    markChecked(filtered.map((item) => item.id));
    message.success("已记录本次查看，下一次同步会显示新内容");
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const status = await fetchSyncStatus();
      if (!status.fullSyncCompleted) {
        message.info("首次使用：先执行全量同步，完成后会切到增量");
        try {
          await startFullSync();
        } catch (cause) {
          // A job may already be running (for example from the Sources page).
          if (!(cause instanceof Error) || !cause.message.includes("already running")) throw cause;
        }
        for (let attempt = 0; attempt < 900; attempt += 1) {
          const current = await fetchSyncStatus();
          if (current.fullSyncCompleted) break;
          if (current.job?.status === "error") throw new Error("全量同步失败，请到数据源页查看失败来源");
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        }
        await load();
        setView("since");
        message.success("首次全量同步完成");
        return;
      }

      const failures: string[] = [];
      for (const itemSource of ["gmail", "ed", "moodle"] as const) {
        try {
          const response = await fetch("/api/sync", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ source: itemSource }),
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
            failures.push(`${itemSource}: ${body?.error?.message ?? response.statusText}`);
          }
        } catch (cause) {
          failures.push(`${itemSource}: ${cause instanceof Error ? cause.message : "network error"}`);
        }
      }
      await load();
      setView("since");
      if (failures.length > 0) {
        message.warning(`部分来源未同步：${failures.join("；")}`);
      } else {
        message.success("Gmail / Ed / Moodle 增量同步完成");
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const handleFeedback = (feedback: Feedback) => {
    if (!feedbackItem) return;
    saveFeedback(feedbackItem.id, feedback);
    message.success("反馈已保存，仅在本机生效");
    setFeedbackItem(null);
  };

  if (loading) {
    return <CoveLoader label="正在整理简报" />;
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
          <Button icon={<ReloadOutlined />} loading={syncing} onClick={() => void handleSync()}>
            同步全部来源
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

      <div className="toolbar brief-filter-bar">
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
        <Select
          className="brief-select"
          value={typeFilter}
          options={typeOptions}
          onChange={(value) => setTypeFilter(value as TypeFilter)}
          aria-label="按类型筛选"
        />
        <Select
          className="brief-select brief-select--course"
          value={courseFilter}
          options={courseOptions}
          onChange={setCourseFilter}
          showSearch
          optionFilterProp="label"
          aria-label="按课程筛选"
        />
        <label className="switch-label">
          <Switch checked={onlyAction} onChange={setOnlyAction} />
          只看需要行动
        </label>
        <label className="switch-label">
          <Switch checked={onlyUnread} onChange={setOnlyUnread} />
          只看未读
        </label>
        {activeFilterCount > 0 ? (
          <Button type="link" size="small" className="clear-filter" onClick={clearFilters}>
            清除筛选（{activeFilterCount}）
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <Empty
          className="brief-empty"
          description={
            <div>
              <Typography.Title level={2}>{view === "since" ? "这次巡检没有新内容" : "没有匹配的内容"}</Typography.Title>
              <Typography.Paragraph type="secondary">
                {view === "since"
                  ? pastItems.length > 0
                    ? "过去的内容仍可展开查看，不会打断当前简报。"
                    : "下一次同步后，新内容会出现在这里。"
                  : "调整来源筛选或搜索词后再试。"}
              </Typography.Paragraph>
            </div>
          }
        >
          <Space>
            {view === "since" ? (
              <Button type="primary" loading={syncing} onClick={() => void handleSync()}>
                同步全部来源
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

      {view === "since" && pastItems.length > 0 ? (
        <Collapse
          ghost
          className="folded-collapse past-collapse"
          activeKey={pastOpen ? ["past"] : []}
          onChange={(keys) => setPastOpen(keys.includes("past"))}
          items={[
            {
              key: "past",
              label: (
                <span>
                  <HistoryOutlined /> 过去的内容 <Tag>{pastItems.length}</Tag>
                </span>
              ),
              children: (
                <div className="past-content">
                  <Typography.Paragraph type="secondary" className="past-note">
                    这些内容早于当前查看窗口，默认折叠。只在需要回看时展开。
                  </Typography.Paragraph>
                  <div className="item-list">
                    {pastItems.slice(0, pastLimit).map((item) => (
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
                  {pastItems.length > pastLimit ? (
                    <Button className="past-more" onClick={() => setPastLimit((current) => current + 20)}>
                      再展开 {Math.min(20, pastItems.length - pastLimit)} 条
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      ) : null}

      <div className="page-footnote">
        <Typography.Text type="secondary">
          本地数据：已连接来源显示真实同步结果，未连接来源显示匿名样本；判断来自规则或模型，证据高亮可在详情中核对。
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
