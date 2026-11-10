import { Button, Tag, Typography } from "antd";
import {
  ACTION_LABELS,
  CONTENT_TYPE_LABELS,
  IMPORTANCE_LABELS,
  OPEN_LABELS,
  SOURCE_LABELS,
  formatAge,
} from "../lib/triage";
import type { Correction, DemoItem } from "../types";

interface ItemCardProps {
  item: DemoItem;
  correction: Correction;
  read: boolean;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDismiss: (id: string) => void;
}

function stateOf(item: DemoItem): "critical" | "important" | "folded" {
  if (item.importance === "critical") return "critical";
  if (item.importance === "important") return "important";
  return "folded";
}

export default function ItemCard({ item, correction, read, onOpen, onTogglePin, onDismiss }: ItemCardProps) {
  const state = stateOf(item);

  return (
    <article className={`item-row ${read ? "item-row--read" : ""}`}>
      <div className="item-row__age">{formatAge(item.ageHours)}</div>

      <div className="item-row__source">
        <b>{SOURCE_LABELS[item.source]}</b>
        <span className="item-row__course">{item.course || "未归属课程"}</span>
      </div>

      <div className="item-row__body">
        <button type="button" className="item-row__title" onClick={() => onOpen(item.id)}>
          {item.title}
        </button>

        <Typography.Paragraph className="item-row__quote" ellipsis={{ rows: 2 }}>
          “{item.evidenceQuote}”
        </Typography.Paragraph>

        <div className="item-row__foot">
          <Tag className={item.contentType === "requirement_change" ? "ant-tag-hot" : undefined}>
            {CONTENT_TYPE_LABELS[item.contentType]}
          </Tag>
          <Tag className={item.actionRequired === "yes" ? "ant-tag-hot" : undefined}>
            {ACTION_LABELS[item.actionRequired]}
          </Tag>
          <Tag>{OPEN_LABELS[item.openOriginal]}</Tag>
          {correction.feedback ? <Tag>已反馈</Tag> : null}
          {correction.pinned ? <Tag>已置顶</Tag> : null}

          <button type="button" className="item-row__open" onClick={() => onOpen(item.id)}>
            查看原文
          </button>

          <span className="item-row__more">
            <Button type="link" size="small" onClick={() => onTogglePin(item.id)}>
              {correction.pinned ? "取消置顶" : "标为重要"}
            </Button>
            <Button type="link" size="small" onClick={() => onDismiss(item.id)}>
              {correction.dismissed ? "恢复" : "不重要"}
            </Button>
          </span>
        </div>
      </div>

      <div className={`item-row__state item-row__state--${state}`}>
        <span className={`state-mark state-mark--${state}`} />
        <span>{IMPORTANCE_LABELS[item.importance]}</span>
      </div>
    </article>
  );
}
