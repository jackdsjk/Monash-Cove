import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntApp, Button, Card, Col, Empty, Row, Select, Skeleton, Space, Tag, Typography } from "antd";
import { BookOutlined, FileTextOutlined, LinkOutlined, NotificationOutlined, ReloadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { fetchMoodleContent, fetchMoodleCourses, syncMoodleContent } from "../data/repository";
import type { MoodleContentItem, MoodleCourse } from "../types";

const MODULE_LABELS: Record<string, string> = {
  resource: "资料",
  folder: "资料夹",
  book: "资料",
  assign: "作业",
  quiz: "Quiz",
  forum: "公告/讨论",
  page: "页面",
  url: "链接",
  lti: "外部工具",
  label: "说明",
};

const CATEGORY_LABELS: Record<string, string> = {
  materials: "资料",
  work: "作业 / 考核",
  other: "说明与其他",
};

function categoryOf(item: MoodleContentItem) {
  if (item.module === "resource" || item.module === "folder" || item.module === "book") return "materials";
  if (item.module === "assign" || item.module === "quiz") return "work";
  return "other";
}

interface Section {
  number: number;
  title: string;
  items: MoodleContentItem[];
}

export default function MaterialsPage() {
  const { message } = AntApp.useApp();
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [items, setItems] = useState<MoodleContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchMoodleCourses()
      .then((next) => {
        if (!active) return;
        setCourses(next);
        const preferred =
          next.find((course) => /FIT1047/i.test(course.shortname)) ??
          next.find((course) => /FIT1045/i.test(course.shortname)) ??
          next.find((course) => /MPU3312/i.test(course.shortname)) ??
          next.find((course) => /ETW2001/i.test(course.shortname)) ??
          next[0];
        if (preferred) setCourseId(preferred.id);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "无法读取 Moodle 课程");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    setLoading(true);
    void fetchMoodleContent(courseId)
      .then((next) => {
        if (active) setItems(next);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "无法读取每周资料");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  const sync = async () => {
    if (!courseId) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await syncMoodleContent(courseId);
      setItems(await fetchMoodleContent(courseId));
      message.success(`已同步 ${result.sections} 个板块、${result.items} 条内容`);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "同步失败";
      setError(text);
      message.error(text);
    } finally {
      setSyncing(false);
    }
  };

  const announcements = useMemo(
    () => items.filter((item) => item.module === "forum" && !/^\d+$/.test(item.title.trim()) && !item.url.includes("#unread")),
    [items],
  );
  const sections = useMemo<Section[]>(() => {
    const map = new Map<number, Section>();
    for (const item of items) {
      if (item.module === "forum") continue;
      const section = map.get(item.sectionNumber) ?? { number: item.sectionNumber, title: item.sectionTitle, items: [] };
      section.items.push(item);
      map.set(item.sectionNumber, section);
    }
    return [...map.values()].sort((a, b) => a.number - b.number);
  }, [items]);

  const materialCount = items.filter((item) => categoryOf(item) === "materials").length;
  const otherCount = items.filter((item) => categoryOf(item) === "other").length;

  if (loading && courses.length === 0) {
    return (
      <div className="brief-skeleton">
        <Skeleton.Input active className="skeleton-title" />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  return (
    <>
      <header className="page-header materials-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            COURSE MATERIALS
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            每周资料
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            按 Moodle 课程板块列出每周资料、公告和其他说明；内容来自课程页，不把资料正文改写成结论。
          </Typography.Paragraph>
        </div>
        <Space wrap className="materials-actions">
          <Select
            className="course-select"
            value={courseId ?? undefined}
            placeholder="选择课程"
            options={courses.map((course) => ({ value: course.id, label: course.shortname || course.fullname }))}
            onChange={setCourseId}
            showSearch
            optionFilterProp="label"
          />
          <Button icon={<ReloadOutlined />} loading={syncing} disabled={!courseId} onClick={() => void sync()}>
            同步资料
          </Button>
        </Space>
      </header>

      {error ? (
        <Alert
          className="page-alert"
          type="warning"
          showIcon
          message="Moodle 资料未就绪"
          description={
            <span>
              {error}。先到 <Link to="/sources">数据源</Link> 连接 Moodle，再同步资料。
            </span>
          }
          action={
            <Button size="small" loading={syncing} onClick={() => void sync()}>
              重试
            </Button>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <>
          <Row className="materials-stats" gutter={[12, 12]}>
            <Col xs={8}><Card size="small"><Typography.Text type="secondary">板块</Typography.Text><div className="materials-stat">{sections.length}</div></Card></Col>
            <Col xs={8}><Card size="small"><Typography.Text type="secondary">资料</Typography.Text><div className="materials-stat">{materialCount}</div></Card></Col>
            <Col xs={8}><Card size="small"><Typography.Text type="secondary">说明与其他</Typography.Text><div className="materials-stat">{otherCount}</div></Card></Col>
          </Row>

          {announcements.length > 0 ? (
            <Card
              className="announcement-card"
              title={
                <Space>
                  <NotificationOutlined />
                  <span>公告与讨论</span>
                  <Tag>{announcements.length}</Tag>
                </Space>
              }
            >
              <div className="material-links">
                {announcements.map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="material-link-row">
                    <Tag color="gold">Moodle</Tag>
                    <span>{item.title}</span>
                    <LinkOutlined />
                  </a>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="materials-sections">
            {sections.map((section) => (
              <Card
                key={`${section.number}-${section.title}`}
                className="materials-section"
                title={
                  <Space wrap>
                    <BookOutlined />
                    <span>{section.title}</span>
                    <Tag>{section.items.length}</Tag>
                  </Space>
                }
              >
                {["materials", "work", "other"].map((category) => {
                  const group = section.items.filter((item) => categoryOf(item) === category);
                  if (group.length === 0) return null;
                  return (
                    <div className="material-group" key={category}>
                      <Typography.Text className="material-group-title" type="secondary">
                        {CATEGORY_LABELS[category]}
                      </Typography.Text>
                      <div className="material-links">
                        {group.map((item) => (
                          <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="material-item">
                            <div className="material-item-title">
                              <Tag>{MODULE_LABELS[item.module] ?? item.module}</Tag>
                              <span>{item.title}</span>
                              <LinkOutlined />
                            </div>
                            {item.text ? <Typography.Paragraph type="secondary" className="material-excerpt">{item.text}</Typography.Paragraph> : null}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Empty
          className="brief-empty"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Typography.Title level={2}>还没有同步这门课的资料</Typography.Title>
              <Typography.Paragraph type="secondary">点击“同步资料”读取每周板块；不会下载或提交作业。</Typography.Paragraph>
            </div>
          }
        >
          <Button type="primary" icon={<FileTextOutlined />} loading={syncing} onClick={() => void sync()}>
            同步资料
          </Button>
        </Empty>
      )}
    </>
  );
}
