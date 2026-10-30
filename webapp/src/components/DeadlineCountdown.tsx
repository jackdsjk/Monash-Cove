import { useEffect, useMemo, useState } from "react";
import { Tag, Typography } from "antd";
import { ClockCircleOutlined, RightOutlined } from "@ant-design/icons";
import type { BriefItem, Correction } from "../types";

interface DeadlineCountdownProps {
  items: BriefItem[];
  corrections: Record<string, Correction>;
  onOpen: (id: string) => void;
  showHeading?: boolean;
}

interface DeadlineBlock {
  id: "overdue" | "today" | "week" | "later";
  title: string;
  note: string;
  tone: "overdue" | "today" | "week" | "later";
}

const BLOCKS: DeadlineBlock[] = [
  { id: "today", title: "24 小时内", note: "现在最需要处理", tone: "today" },
  { id: "week", title: "7 天内", note: "接下来几天要安排", tone: "week" },
  { id: "later", title: "更晚", note: "先知道，不着急", tone: "later" },
  { id: "overdue", title: "已截止", note: "保留供你回看", tone: "overdue" },
];

export default function DeadlineCountdown({ items, corrections, onOpen, showHeading = true }: DeadlineCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
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

  const hero = deadlines[0];
  const rest = deadlines.slice(1);
  const groups = useMemo(() => {
    const buckets = new Map<DeadlineBlock["id"], BriefItem[]>();
    for (const item of rest) {
      const remaining = Date.parse(item.dueAt ?? "") - now;
      const id: DeadlineBlock["id"] =
        remaining <= 0 ? "overdue" : remaining <= 24 * 3_600_000 ? "today" : remaining <= 7 * 24 * 3_600_000 ? "week" : "later";
      const list = buckets.get(id) ?? [];
      list.push(item);
      buckets.set(id, list);
    }
    return BLOCKS.map((block) => ({ ...block, items: buckets.get(block.id) ?? [] })).filter((block) => block.items.length > 0);
  }, [now, rest]);

  if (!hero) return null;

  const heroRemaining = Date.parse(hero.dueAt ?? "") - now;
  const heroTone = toneFor(heroRemaining);
  const heroOverdue = heroRemaining <= 0;

  return (
    <section className="countdown-shell" aria-labelledby={showHeading ? "deadline-heading" : undefined}>
      {showHeading ? (
        <div className="countdown-heading">
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
      ) : null}

      <article
        className={`countdown-hero countdown-hero--${heroTone}`}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(hero.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onOpen(hero.id);
        }}
      >
        <div className="countdown-hero-header">
          <span className="countdown-kicker">
            <span className="countdown-pulse" />
            {heroOverdue ? "已截止" : "最近截止"}
          </span>
          <Tag>{hero.deadlineKind === "quiz" ? "Quiz" : "Moodle 作业"}</Tag>
        </div>

        <div className="countdown-hero-body">
          <div className="countdown-hero-copy">
            <Typography.Text className="countdown-course">{hero.course || "未归属课程"}</Typography.Text>
            <Typography.Title level={2} className="countdown-title">
              {hero.title}
            </Typography.Title>
            <Typography.Text className="countdown-due">
              截止：{formatDue(hero.dueAt)} · {formatWeekday(hero.dueAt)}
            </Typography.Text>
          </div>
          <CountdownClock remaining={heroRemaining} hero />
        </div>

        <div className="countdown-hero-footer">
          <span>点击查看作业详情</span>
          <RightOutlined />
        </div>
      </article>

      {groups.length > 0 ? (
        <div className="countdown-groups">
          {groups.map((group) => (
            <section className={`countdown-group countdown-group--${group.tone}`} key={group.id}>
              <div className="countdown-group-heading">
                <Typography.Title level={3}>{group.title}</Typography.Title>
                <Typography.Text type="secondary">{group.note}</Typography.Text>
                <Tag>{group.items.length}</Tag>
              </div>
              <div className="countdown-list">
                {group.items.map((item) => {
                  const remaining = Date.parse(item.dueAt ?? "") - now;
                  return (
                    <article
                      className="countdown-row"
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpen(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onOpen(item.id);
                      }}
                    >
                      <div className="countdown-row-main">
                        <div className="countdown-row-meta">
                          <Tag>{item.course || "未归属课程"}</Tag>
                          <Tag>{item.deadlineKind === "quiz" ? "Quiz" : "作业"}</Tag>
                        </div>
                        <Typography.Text strong className="countdown-row-title">
                          {item.title}
                        </Typography.Text>
                        <Typography.Text type="secondary" className="countdown-row-due">
                          截止 {formatDue(item.dueAt)}
                        </Typography.Text>
                      </div>
                      <div className="countdown-row-clock">
                        <span className={`countdown-row-state countdown-row-state--${toneFor(remaining)}`}>
                          {remaining <= 0 ? "已截止" : "还剩"}
                        </span>
                        <CompactClock remaining={remaining} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CountdownClock({ remaining, hero = false }: { remaining: number; hero?: boolean }) {
  const overdue = remaining <= 0;
  const parts = splitTime(remaining);
  return (
    <div className={`countdown-clock ${hero ? "countdown-clock--hero" : ""}`}>
      <div className="countdown-clock-state">{overdue ? "已截止" : "距离截止还有"}</div>
      <div className="countdown-digits">
        <TimeUnit value={String(parts.days)} label="天" />
        <span className="countdown-separator">:</span>
        <TimeUnit value={pad(parts.hours)} label="时" />
        <span className="countdown-separator">:</span>
        <TimeUnit value={pad(parts.minutes)} label="分" />
        <span className="countdown-separator">:</span>
        <TimeUnit value={pad(parts.seconds)} label="秒" />
      </div>
    </div>
  );
}

function CompactClock({ remaining }: { remaining: number }) {
  const parts = splitTime(remaining);
  return (
    <span className="countdown-compact-clock">
      {parts.days}天 {pad(parts.hours)}:{pad(parts.minutes)}:{pad(parts.seconds)}
    </span>
  );
}

function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <span className="countdown-unit">
      <span className="countdown-unit-value">{value}</span>
      <span className="countdown-unit-label">{label}</span>
    </span>
  );
}

function splitTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1_000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toneFor(remaining: number): DeadlineBlock["tone"] {
  if (remaining <= 0) return "overdue";
  if (remaining <= 24 * 3_600_000) return "today";
  if (remaining <= 7 * 24 * 3_600_000) return "week";
  return "later";
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

function formatWeekday(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date(value));
}
