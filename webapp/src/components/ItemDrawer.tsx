import { Alert, Badge, Button, Descriptions, Drawer, Grid, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { fetchItemDetail } from "../data/repository";
import {
  ACTION_LABELS,
  CONTENT_TYPE_LABELS,
  IMPORTANCE_LABELS,
  OPEN_LABELS,
  SOURCE_LABELS,
  formatAge,
} from "../lib/triage";
import type { BriefItem, Correction, Importance, ItemSourceDetail } from "../types";

interface ItemDrawerProps {
  item: BriefItem | null;
  open: boolean;
  correction?: Correction;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onDismiss: (id: string) => void;
  onFeedback: (item: BriefItem) => void;
}

function roleLabel(role: "staff" | "student" | "unknown") {
  return role === "staff" ? "老师" : role === "student" ? "学生" : "未知角色";
}

function roleColor(role: "staff" | "student" | "unknown") {
  return role === "staff" ? "gold" : role === "student" ? "blue" : "default";
}

function statusOf(importance: Importance): "error" | "warning" | "default" {
  if (importance === "critical") return "error";
  if (importance === "important") return "warning";
  return "default";
}

function highlighted(text: string, quote: string) {
  const index = quote ? text.indexOf(quote) : -1;
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <Typography.Text mark>{quote}</Typography.Text>
      {text.slice(index + quote.length)}
    </>
  );
}

export default function ItemDrawer({ item, open, correction = {}, onClose, onTogglePin, onDismiss, onFeedback }: ItemDrawerProps) {
  const screens = Grid.useBreakpoint();
  const [detail, setDetail] = useState<ItemSourceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    void fetchItemDetail(item.id)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch(() => {
        if (active) setDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, item?.id]);

  const sourceText = detail?.text || item?.text || "";
  const authorRole = detail?.authorRole ?? (["staff", "student", "unknown"].includes(item?.authorRole ?? "") ? item?.authorRole as "staff" | "student" | "unknown" : "unknown");

  return (
    <Drawer
      className="item-drawer"
      size={screens.md ? 640 : "100%"}
      open={open}
      onClose={onClose}
      title={
        item ? (
          <div>
            <Typography.Text type="secondary" className="drawer-kicker">
              {SOURCE_LABELS[item.source]} · {item.course || "未归属课程"} · {formatAge(item.ageHours)}
            </Typography.Text>
            <Typography.Title level={2} className="drawer-title">
              {item.title}
            </Typography.Title>
          </div>
        ) : null
      }
    >
      {item ? (
        <div className="drawer-body">
          <Space size={[6, 6]} wrap className="drawer-labels">
            <Badge status={statusOf(item.importance)} text={IMPORTANCE_LABELS[item.importance]} />
            <Tag>{CONTENT_TYPE_LABELS[item.contentType]}</Tag>
            <Tag>{ACTION_LABELS[item.actionRequired]}</Tag>
            <Tag>{OPEN_LABELS[item.openOriginal]}</Tag>
            {correction.feedback ? <Tag color="blue">已反馈</Tag> : null}
          </Space>

          <section className="drawer-section">
            <Space wrap>
              <Typography.Title level={3}>原文与回复</Typography.Title>
              <Tag color={roleColor(authorRole)}>{roleLabel(authorRole)}</Tag>
              <Typography.Text>{detail?.authorName || "作者未提供姓名"}</Typography.Text>
            </Space>
            {detailLoading ? <Typography.Text type="secondary">正在读取来源回复…</Typography.Text> : null}
            <Typography.Paragraph className="source-text">{highlighted(sourceText, item.evidenceQuote)}</Typography.Paragraph>
            <Space wrap className="drawer-source-actions">
              <Button type="primary" href={detail?.url || item.url} target="_blank" rel="noreferrer">
                查看原文
              </Button>
              <Typography.Text type="secondary" className="drawer-caption">
                高亮句是模型判断引用的原文片段。
              </Typography.Text>
            </Space>
          </section>

          <section className="drawer-section">
            <Typography.Title level={3}>回复</Typography.Title>
            {detail?.replies?.length ? (
              <div className="source-replies">
                {detail.replies.map((reply) => (
                  <div className="source-reply" key={reply.id} style={{ marginLeft: Math.min(reply.depth, 3) * 18 }}>
                    <Space wrap>
                      <Typography.Text strong>{reply.authorName || "未知作者"}</Typography.Text>
                      <Tag color={roleColor(reply.authorRole)}>{roleLabel(reply.authorRole)}</Tag>
                      {reply.createdAt ? <Typography.Text type="secondary" className="source-reply-date">{new Date(reply.createdAt).toLocaleString("zh-CN")}</Typography.Text> : null}
                    </Space>
                    <Typography.Paragraph className="source-reply-text">{reply.text}</Typography.Paragraph>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary">来源没有返回回复，或该内容本身是公告。</Typography.Text>
            )}
          </section>

          <Alert
            className="drawer-alert"
            type="info"
            showIcon
            message={item.model?.startsWith("deterministic") ? "这是规则判断，不是模型结论" : `判断来源：${item.model ?? "unknown"}`}
            description={`${item.triageVersion ? `规则/模型版本：${item.triageVersion}。` : ""}判断可能出错，请以原文和学校系统为准。`}
          />

          <section className="drawer-section">
            <Typography.Title level={3}>判断字段</Typography.Title>
            <Descriptions
              size="small"
              column={2}
              colon={false}
              items={[
                { key: "type", label: "内容类型", children: CONTENT_TYPE_LABELS[item.contentType] },
                { key: "importance", label: "重要性", children: IMPORTANCE_LABELS[item.importance] },
                { key: "action", label: "行动要求", children: ACTION_LABELS[item.actionRequired] },
                { key: "open", label: "原文建议", children: OPEN_LABELS[item.openOriginal] },
              ]}
            />
          </section>

          <Space className="drawer-actions" wrap>
            <Button onClick={() => onTogglePin(item.id)}>{correction.pinned ? "取消置顶" : "标为重要"}</Button>
            <Button onClick={() => onDismiss(item.id)}>{correction.dismissed ? "恢复显示" : "标为不重要"}</Button>
            <Button type="primary" onClick={() => onFeedback(item)}>
              反馈判断
            </Button>
          </Space>

          {correction.feedback ? (
            <Typography.Text type="secondary" className="drawer-caption">
              已保存反馈：{correction.feedback.reason} · {correction.feedback.note || "无补充说明"}
            </Typography.Text>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
