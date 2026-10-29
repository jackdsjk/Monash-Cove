import { Badge, Button, Card, Space, Tag, Typography } from "antd";
import {
  ACTION_LABELS,
  CONTENT_TYPE_LABELS,
  IMPORTANCE_LABELS,
  OPEN_LABELS,
  SOURCE_LABELS,
  formatAge,
} from "../lib/triage";
import type { Correction, DemoItem, Importance } from "../types";

interface ItemCardProps {
  item: DemoItem;
  correction: Correction;
  read: boolean;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDismiss: (id: string) => void;
}

function importanceStatus(importance: Importance): "error" | "warning" | "default" {
  if (importance === "critical") return "error";
  if (importance === "important") return "warning";
  return "default";
}

export default function ItemCard({ item, correction, read, onOpen, onTogglePin, onDismiss }: ItemCardProps) {
  return (
    <Card className={`item-card ${item.importance === "critical" ? "item-card--critical" : ""} ${read ? "item-card--read" : ""} ${correction.pinned ? "item-card--pinned" : ""}`}>
      <div className="item-meta">
        <span className={`source-dot source-dot--${item.source}`} />
        <Typography.Text strong>{SOURCE_LABELS[item.source]}</Typography.Text>
        <Typography.Text type="secondary">{item.course || "未归属课程"}</Typography.Text>
        <Typography.Text type="secondary">·</Typography.Text>
        <Typography.Text type="secondary">{formatAge(item.ageHours)}</Typography.Text>
        <Badge className="item-status" status={importanceStatus(item.importance)} text={IMPORTANCE_LABELS[item.importance]} />
      </div>

      <Button className="item-title" type="text" onClick={() => onOpen(item.id)}>
        {item.title}
      </Button>

      <Typography.Paragraph className="item-evidence" type="secondary" ellipsis={{ rows: 2 }}>
        “{item.evidenceQuote}”
      </Typography.Paragraph>

      <Space className="item-tags" size={[4, 4]} wrap>
        <Tag>{CONTENT_TYPE_LABELS[item.contentType]}</Tag>
        <Tag>{ACTION_LABELS[item.actionRequired]}</Tag>
        <Tag>{OPEN_LABELS[item.openOriginal]}</Tag>
        {correction.feedback ? <Tag color="blue">已反馈</Tag> : null}
        {correction.pinned ? <Tag color="green">已置顶</Tag> : null}
      </Space>

      <div className="item-actions">
        <Button type="link" size="small" onClick={() => onOpen(item.id)}>
          查看原文
        </Button>
        <Button type="link" size="small" onClick={() => onTogglePin(item.id)}>
          {correction.pinned ? "取消置顶" : "标为重要"}
        </Button>
        <Button type="link" size="small" onClick={() => onDismiss(item.id)}>
          {correction.dismissed ? "恢复" : "不重要"}
        </Button>
      </div>
    </Card>
  );
}
