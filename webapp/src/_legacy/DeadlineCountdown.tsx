import { useEffect, useMemo, useState } from "react";
import type { BriefItem, Correction } from "../types";

interface DeadlineCountdownProps {
  items: BriefItem[];
  corrections: Record<string, Correction>;
  onOpen: (id: string) => void;
  /** 用户手动标记为已提交（有些作业不在 Moodle 上提交） */
  onMarkSubmitted?: (id: string) => void;
}

type Bucket = "overdue" | "today" | "soon" | "later";

const BUCKETS: { key: Bucket; title: string; note: string }[] = [
  { key: "overdue", title: "已截止", note: "需要补交或联系老师" },
  { key: "today", title: "24 小时内", note: "先处理这一组" },
  { key: "soon", title: "三天内", note: "本周内到期" },
  { key: "later", title: "更晚", note: "可以先记下" },
];

const HOUR = 3_600_000;

function bucketOf(remaining: number): Bucket {
  if (remaining <= 0) return "overdue";
  if (remaining <= 24 * HOUR) return "today";
  if (remaining <= 72 * HOUR) return "soon";
  return "later";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
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

function FlipPair({ value }: { value: string }) {
  return (
    <>
      {value.split("").map((digit, index) => (
        <span className="flip-cell" key={index}>
          {/* key 变化时才重挂载，翻牌动画只在该位数字真的变了时播放 */}
          <span className="flip-cell__num" key={digit}>
            {digit}
          </span>
        </span>
      ))}
    </>
  );
}

function FlipClock({ remaining }: { remaining: number }) {
  const total = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(total / 86_400);
  const hours = pad(Math.floor((total % 86_400) / 3_600));
  const minutes = pad(Math.floor((total % 3_600) / 60));
  const seconds = pad(total % 60);

  return (
    <div className="flip-clock" aria-label={`剩余 ${days} 天 ${hours} 小时 ${minutes} 分 ${seconds} 秒`}>
      <FlipPair value={hours} />
      <span className="flip-colon">:</span>
      <FlipPair value={minutes} />
      <span className="flip-colon">:</span>
      <FlipPair value={seconds} />
    </div>
  );
}

export default function DeadlineCountdown({ items, corrections, onOpen, onMarkSubmitted }: DeadlineCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const deadlines = useMemo(
    () =>
      items
        .filter((item) => (item.source === "moodle" || item.source === "ontrack") && item.dueAt && !item.completedAt && !corrections[item.id]?.dismissed)
        .filter((item) => Number.isFinite(Date.parse(item.dueAt ?? "")))
        .sort((a, b) => Date.parse(a.dueAt ?? "") - Date.parse(b.dueAt ?? "")),
    [corrections, items],
  );

  if (deadlines.length === 0) return null;

  return (
    <div className="dl-groups">
      {BUCKETS.map((bucket) => {
        const list = deadlines.filter((item) => bucketOf(Date.parse(item.dueAt ?? "") - now) === bucket.key);
        if (list.length === 0) return null;
        return (
          <section className="dl-group" key={bucket.key}>
            <div className="dl-head">
              <b>{bucket.title}</b>
              <i>{list.length} 项</i>
              <em>{bucket.note}</em>
            </div>
            <div className="dl-grid">
              {list.map((item) => {
                const remaining = Date.parse(item.dueAt ?? "") - now;
                const tone = bucketOf(remaining);
                return (
                  <div
                    className={`dl-tile dl-tile--${tone}`}
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onOpen(item.id);
                    }}
                  >
                    <div className="dl-tile__head">
                      <span className="dl-tile__course">{item.course || "未归属课程"}</span>
                      <span className="dl-tile__kind">{item.deadlineKind === "quiz" ? "Quiz" : "作业"}</span>
                    </div>

                    <div className="dl-tile__title">{item.title}</div>

                    <div className="dl-tile__clock">
                      {remaining <= 0 ? <span className="dl-tile__overdue">已截止</span> : <FlipClock remaining={remaining} />}
                    </div>

                    <div className="dl-tile__bar">
                      <span className="dl-tile__foot">
                        {remaining > 86_400_000 ? `${Math.floor(remaining / 86_400_000)} 天 · ` : ""}
                        {formatDue(item.dueAt)}
                      </span>
                      {onMarkSubmitted ? (
                        <button
                          type="button"
                          className="dl-tile__submit"
                          onClick={(event) => {
                            event.stopPropagation();
                            onMarkSubmitted(item.id);
                          }}
                        >
                          我已提交
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
