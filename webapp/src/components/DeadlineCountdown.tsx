import { useEffect, useMemo, useState } from "react";
import { Card, Tag, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import type { BriefItem, Correction } from "../types";

interface DeadlineCountdownProps {
  items: BriefItem[];
  corrections: Record<string, Correction>;
  onOpen: (id: string) => void;
}

interface DeadlineBlock {
  id: "overdue" | "today" | "week" | "later";
  title: string;
  note: string;
  tone: string;
}

const BLOCKS: DeadlineBlock[] = [
  { id: "overdue", title: "已截止", note: "已经超过截止时间，仍保留供你回看", tone: "overdue" },
  { id: "today", title: "24 小时内", note: "最需要现在处理", tone: "today" },
  { id: "week", title: "7 天内", note: "接下来几天要安排", tone: "week" },
  { id: "later", title: "更晚", note: "先知道，不用现在处理", tone: "later" },
];

export default function DeadlineCountdown({ items, corrections, onOpen }: DeadlineCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const deadlines = useMemo(
    () =>
      items
        .filter((item) => item.source === "moodle" && item.dueAt && !corrections[item.id]?.dismissed)
        .filter((item) => Number.isFinite(Date.parse(item.dueAt ?? "")))
        .sort((a, b) => Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? "")),
    [corrections, items],
  );

  const groups = useMemo(() => {
    const buckets = new Map<DeadlineBlock["id"], BriefItem[]>();
    for (const item of deadlines) {
      const remaining = Date.parse(item.dueAt ?? "") - now;
      const id: DeadlineBlock["id"] =
        remaining <= 0 ? "overdue" : remaining <= 24 * 3_600_000 ? "today" : remaining <= 7 * 24 * 3_600_000 ? "week" : "later";
      const list = buckets.get(id) ?? [];
      list.push(item);
      buckets.set(id, list);
    }
    return BLOCKS.map((block) => ({ ...block, items: buckets.get(block.id) ?? [] })).filter((block) => block.items.length > 0);
  }, [deadlines, now]);

  if (groups.length === 0) return null;

  return (
    <section className="deadline-section" aria-labelledby="deadline-heading">
      <div className="deadline-heading">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            MOODLE DEADLINES
          </Typography.Text>
          <Typography.Title level={2} id="deadline-heading">
            截止倒计时
          </Typography.Title>
          <Typography.Text type="secondary">按 Moodle 作业截止时间自动生成；不需要你手动计算。</Typography.Text>
        </div>
        <Tag icon={<ClockCircleOutlined />} color="default">
          {deadlines.length} 个截止项
        </Tag>
      </div>

      <div className="deadline-groups">
        {groups.map((group) => (
          <section className={`deadline-group deadline-group--${group.tone}`} key={group.id}>
            <div className="deadline-group-heading">
              <Typography.Title level={3}>{group.title}</Typography.Title>
              <Typography.Text type="secondary">{group.note}</Typography.Text>
              <Tag>{group.items.length}</Tag>
            </div>
            <div className="deadline-cards">
              {group.items.map((item) => {
                const remaining = Date.parse(item.dueAt ?? "") - now;
                return (
                  <Card
                    key={item.id}
                    size="small"
                    hoverable
                    className={`deadline-card deadline-card--${group.tone}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onOpen(item.id);
                    }}
                  >
                    <div className="deadline-card-meta">
                      <Tag>{item.course || "未归属课程"}</Tag>
                      <Tag>{item.deadlineKind === "quiz" ? "Quiz" : "作业"}</Tag>
                    </div>
                    <Typography.Text strong className="deadline-card-title">
                      {item.title}
                    </Typography.Text>
                    <div className={`deadline-remaining deadline-remaining--${group.tone}`}>
                      {remaining <= 0 ? `已截止 ${formatDuration(-remaining)}` : `还剩 ${formatDuration(remaining)}`}
                    </div>
                    <Typography.Text type="secondary" className="deadline-due">
                      截止：{formatDue(item.dueAt)}
                    </Typography.Text>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return `${totalHours} 小时${minutes > 0 ? ` ${minutes} 分` : ""}`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} 天${hours > 0 ? ` ${hours} 小时` : ""}`;
}

function formatDue(value: string | null | undefined) {
  if (!value) return "待确认";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
