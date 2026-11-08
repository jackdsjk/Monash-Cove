import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App as AntApp, Button, Drawer, Empty, Tag, Typography } from "antd";
import { DownloadOutlined, LinkOutlined, MessageOutlined } from "@ant-design/icons";
import CoveLoader from "../components/CoveLoader";
import { fetchBrief, fetchOnTrackAccount, fetchOnTrackComments, fetchOnTrackTasks } from "../data/repository";
import type { BriefItem, OnTrackAccount, OnTrackCommentView, OnTrackProjectView, OnTrackTaskView } from "../types";

const STATUS_LABELS: Record<string, string> = {
  complete: "已完成",
  discuss: "待讨论",
  assess_in_portfolio: "待评估",
  not_started: "未开始",
  working_on_it: "进行中",
  need_help: "需要帮助",
  ready_for_feedback: "待反馈",
  ready_to_mark: "待批改",
};

const ONTRACK_ORIGIN = "https://ontrack.infotech.monash.edu";

/** OnTrack names pass/credit/distinction tasks by their first letter. */
const GRADES = [
  { key: "P", label: "Pass" },
  { key: "C", label: "Credit" },
  { key: "D", label: "Distinction" },
  { key: "HD", label: "High Distinction" },
] as const;

function gradeOf(task: OnTrackTaskView): string {
  const first = (task.abbreviation || "").trim().toUpperCase().slice(0, 1);
  if (first === "H") return "HD";
  return first || "P";
}

const GRADE_KEYS = ["P", "C", "D", "HD"];

function statusTone(status: string) {
  if (status === "complete") return "done";
  if (status === "assess_in_portfolio" || status === "discuss") return "open";
  if (status === "not_started") return "idle";
  return "active";
}

function formatDay(value: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(`${value}T00:00:00`);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(parsed));
}

function formatMoment(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export default function OnTrackWorkspace() {
  const { message } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<OnTrackAccount | null>(null);
  const [projects, setProjects] = useState<OnTrackProjectView[]>([]);
  const [tasks, setTasks] = useState<OnTrackTaskView[]>([]);
  const [feedback, setFeedback] = useState<BriefItem[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [feedbackLimit, setFeedbackLimit] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [threadTask, setThreadTask] = useState<OnTrackTaskView | null>(null);
  const [thread, setThread] = useState<OnTrackCommentView[]>([]);
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [accountResult, taskResult, brief] = await Promise.all([
          fetchOnTrackAccount(),
          fetchOnTrackTasks(),
          fetchBrief().catch(() => null),
        ]);
        if (!active) return;
        setAccount(accountResult.connected ? accountResult.account : null);
        setProjects(taskResult.projects);
        setTasks(taskResult.tasks);
        setFeedback(
          (brief?.items ?? [])
            .filter((item) => item.id.startsWith("ontrack:feedback:"))
            .sort((a, b) => a.ageHours - b.ageHours),
        );
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "无法读取 OnTrack 数据。");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const taskLabel = useCallback((task: OnTrackTaskView) => [task.abbreviation, task.name].filter(Boolean).join(" "), []);

  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length, P: 0, C: 0, D: 0, HD: 0, other: 0 };
    for (const task of tasks) {
      const key = gradeOf(task);
      counts[GRADE_KEYS.includes(key) ? key : "other"] += 1;
    }
    return counts;
  }, [tasks]);

  const gradeTasks = useMemo(
    () =>
      gradeFilter === "all"
        ? tasks
        : tasks.filter((task) =>
            gradeFilter === "other" ? !GRADE_KEYS.includes(gradeOf(task)) : gradeOf(task) === gradeFilter,
          ),
    [gradeFilter, tasks],
  );

  const visibleTasks = useMemo(() => {
    const list = onlyOpen ? gradeTasks.filter((task) => task.status !== "complete") : gradeTasks;
    return [...list].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }, [gradeTasks, onlyOpen]);

  const openCount = useMemo(() => tasks.filter((task) => task.status !== "complete").length, [tasks]);

  const feedbackPool = useMemo(() => {
    if (gradeFilter === "all") return feedback;
    const allowed = gradeTasks.map(taskLabel).filter(Boolean);
    return feedback.filter((item) => allowed.some((label) => item.title.includes(label)));
  }, [feedback, gradeFilter, gradeTasks, taskLabel]);

  const feedbackFor = useMemo(() => {
    if (taskFilter === "all") return feedbackPool;
    const task = tasks.find((entry) => String(entry.taskDefinitionId) === taskFilter);
    if (!task) return feedbackPool;
    const label = taskLabel(task);
    return feedbackPool.filter((item) => item.title.includes(label));
  }, [feedbackPool, taskFilter, taskLabel, tasks]);

  const filterOptions = useMemo(() => {
    const options = gradeTasks
      .map((task) => ({
        value: String(task.taskDefinitionId),
        label: taskLabel(task),
        count: feedbackPool.filter((item) => item.title.includes(taskLabel(task))).length,
      }))
      .filter((option) => option.count > 0)
      .sort((a, b) => b.count - a.count);
    return [{ value: "all", label: "全部任务", count: feedbackPool.length }, ...options];
  }, [feedbackPool, gradeTasks, taskLabel]);

  const openThread = async (task: OnTrackTaskView) => {
    setThreadTask(task);
    setThread([]);
    setThreadLoading(true);
    try {
      const result = await fetchOnTrackComments(task.projectId, task.taskDefinitionId);
      setThread(result.comments);
      setViewerId(result.viewerId);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "无法读取对话记录");
    } finally {
      setThreadLoading(false);
    }
  };

  const handleDownload = (task: OnTrackTaskView, kind: "resources" | "submission") => {
    message.info(kind === "resources" ? "正在准备任务资源…" : "正在准备提交 PDF…");
    window.open(`/api/ontrack/artifact?project=${task.projectId}&task=${task.taskDefinitionId}&kind=${kind}`, "_blank");
  };

  if (loading) {
    return <CoveLoader label="正在读取 OnTrack" />;
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__main">
          <Typography.Title level={1} className="page-title">
            OnTrack
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            {projects.length > 0
              ? `${projects.map((project) => project.unitCode).join("、")} 的任务与导师反馈；只读，不会提交或修改任何东西。`
              : "OnTrack 的任务与导师反馈；只读，不会提交或修改任何东西。"}
          </Typography.Paragraph>
        </div>
        <div className="page-header__side">
          <div className="board-counters">
            <div className="board-counter board-counter--hot">
              <div className="board-flap">
                <b>{openCount}</b>
              </div>
              <span>未完成</span>
            </div>
            <div className="board-counter">
              <div className="board-flap">
                <b>{tasks.length}</b>
              </div>
              <span>任务</span>
            </div>
            <div className="board-counter">
              <div className="board-flap">
                <b>{feedback.length}</b>
              </div>
              <span>反馈</span>
            </div>
          </div>
        </div>
      </header>

      {account ? (
        <div className="ot-account">
          <span className="source-dot source-dot--ontrack" />
          <span className="ot-account__name">{`${account.firstName} ${account.lastName}`.trim() || account.username}</span>
          <span className="ot-account__mail">{account.email}</span>
          <Tag className="ot-account__tag">只读</Tag>
        </div>
      ) : null}

      {error ? (
        <Alert
          className="page-alert"
          type="warning"
          showIcon
          message="OnTrack 暂时不可用"
          description={`${error}。到数据源页可以查看登录方式。`}
        />
      ) : null}

      {tasks.length === 0 && !error ? (
        <Empty className="brief-empty" description={<Typography.Text type="secondary">OnTrack 里还没有任务。</Typography.Text>} />
      ) : (
        <>
          <div className="ot-grades" role="tablist" aria-label="按任务等级筛选">
            <button
              type="button"
              className="ot-grade"
              aria-selected={gradeFilter === "all"}
              onClick={() => {
                setGradeFilter("all");
                setTaskFilter("all");
              }}
            >
              全部<span>{gradeCounts.all}</span>
            </button>
            {GRADES.map((grade) => (
              <button
                key={grade.key}
                type="button"
                className="ot-grade"
                aria-selected={gradeFilter === grade.key}
                onClick={() => {
                  setGradeFilter(grade.key);
                  setTaskFilter("all");
                }}
              >
                {grade.key}
                <em>{grade.label}</em>
                <span>{gradeCounts[grade.key] ?? 0}</span>
              </button>
            ))}
            {gradeCounts.other > 0 ? (
              <button
                type="button"
                className="ot-grade"
                aria-selected={gradeFilter === "other"}
                onClick={() => {
                  setGradeFilter("other");
                  setTaskFilter("all");
                }}
              >
                其他<span>{gradeCounts.other}</span>
              </button>
            ) : null}
            <button type="button" className="ot-toggle" onClick={() => setOnlyOpen((value) => !value)}>
              {onlyOpen ? "显示全部" : "只看未完成"}
            </button>
          </div>

          <div className="ot-table">
            <div className="ot-thead">
              <span>编号</span>
              <span>任务</span>
              <span>状态</span>
              <span>截止</span>
              <span>权重</span>
              <span className="ot-right">操作</span>
            </div>
            {visibleTasks.map((task) => (
              <div
                className="ot-trow ot-trow--task"
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => void openThread(task)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") void openThread(task);
                }}
              >
                <span className="ot-abbr">{task.abbreviation || "—"}</span>
                <span className="ot-name">
                  {task.name || "未命名任务"}
                  {task.timesAssessed > 0 ? <em className="ot-assessed">已批改 {task.timesAssessed} 次</em> : null}
                </span>
                <span>
                  <Tag className={`ot-status ot-status--${statusTone(task.status)}`}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </Tag>
                </span>
                <span className="ot-due">{formatDay(task.dueDate)}</span>
                <span className="ot-weight">{task.weighting ? `${task.weighting}%` : "—"}</span>
                <span className="ot-actions" onClick={(event) => event.stopPropagation()}>
                  <Button type="link" size="small" icon={<MessageOutlined />} onClick={() => void openThread(task)}>
                    对话
                  </Button>
                  <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(task, "resources")}>
                    资源
                  </Button>
                  <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(task, "submission")}>
                    提交
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    href={`${ONTRACK_ORIGIN}/#/projects/${task.projectId}/tasks/${task.taskDefinitionId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开
                  </Button>
                </span>
              </div>
            ))}
          </div>

          <div className="ot-toolbar">
            <b>导师反馈</b>
            <span>{feedbackFor.length} 条</span>
            <select
              className="ot-select"
              value={taskFilter}
              onChange={(event) => {
                setTaskFilter(event.target.value);
                setFeedbackLimit(20);
              }}
              aria-label="按任务筛选反馈"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}（{option.count}）
                </option>
              ))}
            </select>
          </div>

          {feedbackFor.length === 0 ? (
            <Typography.Paragraph type="secondary">
              还没有抓取到导师反馈。同步一次之后，导师的评语和自动评分会出现在这里。
            </Typography.Paragraph>
          ) : (
            <div className="ot-table">
              <div className="ot-thead ot-thead--feedback">
                <span>时间</span>
                <span>任务</span>
                <span>内容</span>
                <span className="ot-right">操作</span>
              </div>
              {feedbackFor.slice(0, feedbackLimit).map((item) => {
                const open = expanded.has(item.id);
                const long = (item.text ?? "").length > 180;
                return (
                  <div className="ot-trow ot-trow--feedback" key={item.id}>
                    <span className="ot-due">{formatDay(item.publishedAt?.slice(0, 10) ?? null)}</span>
                    <span className="ot-name" title={item.title.replace(/：.*$/, "")}>
                      {item.title.replace(/：.*$/, "").replace(/^FIT\d+\s+/, "")}
                    </span>
                    <span className={`ot-comment${open ? " ot-comment--open" : ""}`}>{item.text || item.evidenceQuote}</span>
                    <span className="ot-actions">
                      {long ? (
                        <Button
                          type="link"
                          size="small"
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                        >
                          {open ? "收起" : "展开"}
                        </Button>
                      ) : null}
                      <Button type="link" size="small" icon={<LinkOutlined />} href={item.url} target="_blank" rel="noreferrer">
                        原文
                      </Button>
                    </span>
                  </div>
                );
              })}
              {feedbackFor.length > feedbackLimit ? (
                <div className="ot-more">
                  <Button type="link" size="small" onClick={() => setFeedbackLimit((value) => value + 20)}>
                    再显示 {Math.min(20, feedbackFor.length - feedbackLimit)} 条
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      <Drawer
        open={Boolean(threadTask)}
        onClose={() => setThreadTask(null)}
        width={560}
        title={
          threadTask ? (
            <span className="ot-thread-title">
              <span className="ot-abbr">{threadTask.abbreviation}</span>
              {threadTask.name}
            </span>
          ) : null
        }
      >
        {threadTask ? (
          <>
            <div className="ot-thread-meta">
              <Tag className={`ot-status ot-status--${statusTone(threadTask.status)}`}>
                {STATUS_LABELS[threadTask.status] ?? threadTask.status}
              </Tag>
              <span>截止 {formatDay(threadTask.dueDate)}</span>
              <span>权重 {threadTask.weighting ? `${threadTask.weighting}%` : "—"}</span>
            </div>

            {threadLoading ? (
              <Typography.Text type="secondary">正在读取对话…</Typography.Text>
            ) : thread.length === 0 ? (
              <Typography.Text type="secondary">这个任务还没有评论。</Typography.Text>
            ) : (
              <ol className="ot-thread">
                {[...thread]
                  .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
                  .map((comment) => {
                    const mine = viewerId !== null && comment.authorId === viewerId;
                    const system = ["status", "plan", "grade", "assessment"].includes(comment.type);
                    if (system) {
                      return (
                        <li key={comment.id} className="ot-thread__system">
                          <span>{formatMoment(comment.createdAt)}</span>
                          <span>{comment.authorName || "系统"}</span>
                          <b>{comment.comment}</b>
                        </li>
                      );
                    }
                    return (
                      <li key={comment.id} className={`ot-thread__msg${mine ? " ot-thread__msg--mine" : ""}`}>
                        <div className="ot-thread__who">
                          <b>{comment.authorName || (mine ? "我" : "未知")}</b>
                          <span>{formatMoment(comment.createdAt)}</span>
                        </div>
                        <div className="ot-thread__body">{comment.comment}</div>
                      </li>
                    );
                  })}
              </ol>
            )}
          </>
        ) : null}
      </Drawer>
    </>
  );
}
