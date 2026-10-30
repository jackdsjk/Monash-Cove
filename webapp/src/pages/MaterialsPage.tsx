import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntApp, Button, Card, Checkbox, Col, Empty, Input, Row, Segmented, Select, Space, Tag, Typography } from "antd";
import { BookOutlined, DownloadOutlined, FileTextOutlined, LinkOutlined, NotificationOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import CoveLoader from "../components/CoveLoader";
import { fetchMoodleContent, fetchMoodleCourses, syncMoodleContent } from "../data/repository";
import type { MoodleContentItem, MoodleCourse } from "../types";
import { REGION_LABELS, REGION_OPTIONS, courseMatchesRegion, defaultRegionForCourses, loadRegion, saveRegion, textMatchesRegion, type CampusRegion } from "../lib/region";

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
  // Resources attached to the assessment section belong to the assignment
  // workflow, not the general weekly reading list.
  if (
    /assessment|assignment|考核|作业/i.test(item.sectionTitle) &&
    ["resource", "folder", "book", "url", "page", "assign", "quiz"].includes(item.module)
  ) {
    return "work";
  }
  if (item.module === "resource" || item.module === "folder" || item.module === "book") return "materials";
  if (item.module === "assign" || item.module === "quiz") return "work";
  return "other";
}

function isDownloadable(item: MoodleContentItem) {
  return item.module === "resource" || item.module === "url";
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
  const [region, setRegion] = useState<CampusRegion>(() => loadRegion() ?? "malaysia");
  const [items, setItems] = useState<MoodleContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "materials" | "work" | "forum" | "other">("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMoodleCourses()
      .then((next) => {
        if (!active) return;
        setCourses(next);
        const effectiveRegion = loadRegion() ?? defaultRegionForCourses(next);
        setRegion(effectiveRegion);
        saveRegion(effectiveRegion);
        const visible = next.filter((course) => courseMatchesRegion(course, effectiveRegion));
        const preferred =
          visible.find((course) => /FIT1047/i.test(course.shortname)) ??
          visible.find((course) => /FIT1045/i.test(course.shortname)) ??
          visible.find((course) => /MPU3312/i.test(course.shortname)) ??
          visible.find((course) => /ETW2001/i.test(course.shortname)) ??
          visible[0];
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

  const visibleCourses = useMemo(
    () => courses.filter((course) => courseMatchesRegion(course, region)),
    [courses, region],
  );

  const selectRegion = (next: CampusRegion) => {
    setRegion(next);
    saveRegion(next);
    setSelected([]);
    const visible = courses.filter((course) => courseMatchesRegion(course, next));
    setCourseId(visible[0]?.id ?? null);
  };

  const sectionOptions = useMemo(
    () =>
      [...new Map(
        items
          .filter((item) => textMatchesRegion(`${item.sectionTitle} ${item.title}`, region))
          .map((item) => [item.sectionNumber, item.sectionTitle]),
      ).entries()]
        .sort(([a], [b]) => a - b)
        .map(([value, label]) => ({ value: String(value), label })),
    [items, region],
  );

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!textMatchesRegion(`${item.sectionTitle} ${item.title}`, region)) return false;
      if (typeFilter === "forum") {
        if (item.module !== "forum") return false;
      } else if (typeFilter !== "all" && categoryOf(item) !== typeFilter) {
        return false;
      }
      if (sectionFilter !== "all" && String(item.sectionNumber) !== sectionFilter) return false;
      if (!needle) return true;
      return [item.title, item.text, item.sectionTitle, item.courseName, item.module]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, query, region, sectionFilter, typeFilter]);

  const announcements = useMemo(
    () =>
      filteredItems.filter(
        (item) => item.module === "forum" && !/^\d+$/.test(item.title.trim()) && !item.url.includes("#unread"),
      ),
    [filteredItems],
  );
  const sections = useMemo<Section[]>(() => {
    const map = new Map<number, Section>();
    for (const item of filteredItems) {
      if (item.module === "forum") continue;
      const section = map.get(item.sectionNumber) ?? { number: item.sectionNumber, title: item.sectionTitle, items: [] };
      section.items.push(item);
      map.set(item.sectionNumber, section);
    }
    return [...map.values()].sort((a, b) => a.number - b.number);
  }, [filteredItems]);

  const materialCount = filteredItems.filter((item) => categoryOf(item) === "materials").length;
  const otherCount = filteredItems.filter((item) => categoryOf(item) === "other").length;
  const downloadableItems = useMemo(() => filteredItems.filter(isDownloadable), [filteredItems]);
  const allSelected = downloadableItems.length > 0 && downloadableItems.every((item) => selected.includes(item.id));
  const someSelected = downloadableItems.some((item) => selected.includes(item.id));

  useEffect(() => {
    setSelected([]);
  }, [courseId, query, region, sectionFilter, typeFilter]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? downloadableItems.map((item) => item.id) : []);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)));
  };

  const downloadSelected = async () => {
    const chosen = items.filter((item) => isDownloadable(item) && selected.includes(item.id));
    if (chosen.length === 0) return;
    const currentCourse = courses.find((course) => course.id === courseId);
    const currentSection = sectionFilter === "all" ? null : sectionOptions.find((option) => option.value === sectionFilter);
    const archiveBase = `${currentCourse?.shortname ?? "Moodle"}${currentSection ? `-${currentSection.label}` : "-Materials"}`;
    const archiveName = `${archiveBase}.zip`;
    setDownloading(true);
    try {
      const response = await fetch("/api/moodle/download-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          archiveName,
          items: chosen.map((item) => ({ url: item.url, name: item.title })),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `下载失败：HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = archiveName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      const count = response.headers.get("x-cove-batch-count") ?? String(chosen.length);
      const skipped = response.headers.get("x-cove-batch-skipped");
      message.success(`已打包 ${count} 个资料${skipped && skipped !== "0" ? `，跳过 ${skipped} 个` : ""}`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "批量下载失败");
    } finally {
      setDownloading(false);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setSectionFilter("all");
  };

  if (loading) {
    return <CoveLoader label="正在整理每周资料" />;
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
            className="region-select"
            value={region}
            options={REGION_OPTIONS}
            onChange={selectRegion}
            aria-label="选择地区"
          />
          <Select
            className="course-select"
            value={courseId ?? undefined}
            placeholder={`选择${REGION_LABELS[region]}课程`}
            options={visibleCourses.map((course) => ({ value: course.id, label: course.shortname || course.fullname }))}
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

          <Card className="materials-filter-bar" size="small">
            <Space wrap size={[8, 8]}>
              <Input
                className="materials-search"
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索资料、说明或公告"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Segmented
                value={typeFilter}
                options={[
                  { label: "全部", value: "all" },
                  { label: "资料", value: "materials" },
                  { label: "作业", value: "work" },
                  { label: "公告", value: "forum" },
                  { label: "说明", value: "other" },
                ]}
                onChange={(value) => setTypeFilter(value as typeof typeFilter)}
              />
              <Select
                className="section-filter"
                value={sectionFilter}
                onChange={setSectionFilter}
                options={[{ value: "all", label: "全部板块" }, ...sectionOptions]}
                showSearch
                optionFilterProp="label"
              />
              <Typography.Text type="secondary">{filteredItems.length} 条</Typography.Text>
              <Checkbox
                className="materials-select-all"
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                disabled={downloadableItems.length === 0}
                onChange={(event) => toggleAll(event.target.checked)}
              >
                全选可下载资料（{downloadableItems.length}）
              </Checkbox>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={downloading}
                disabled={selected.length === 0}
                onClick={() => void downloadSelected()}
              >
                下载选中{selected.length > 0 ? `（${selected.length}）` : ""}
              </Button>
            </Space>
          </Card>

          {filteredItems.length === 0 ? (
            <Empty
              className="brief-empty"
              description={
                <div>
                  <Typography.Title level={2}>没有匹配的内容</Typography.Title>
                  <Typography.Paragraph type="secondary">调整搜索词、类型或板块筛选。</Typography.Paragraph>
                </div>
              }
            >
              <Button onClick={resetFilters}>清除筛选</Button>
            </Empty>
          ) : null}

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
                    <div className="material-link-main">
                      <div>
                        <Tag color="gold">Moodle</Tag>
                        <span>{item.title}</span>
                        <LinkOutlined />
                      </div>
                      {item.text ? (
                        <Typography.Paragraph type="secondary" className="material-excerpt">
                          {item.text}
                        </Typography.Paragraph>
                      ) : null}
                    </div>
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
                          <div key={item.id} className="material-item">
                            <div className="material-item-title">
                              {isDownloadable(item) ? (
                                <Checkbox
                                  checked={selected.includes(item.id)}
                                  onChange={(event) => toggleOne(item.id, event.target.checked)}
                                  aria-label={`选择 ${item.title}`}
                                />
                              ) : null}
                              <Tag>{MODULE_LABELS[item.module] ?? item.module}</Tag>
                              <a href={item.url} target="_blank" rel="noreferrer">
                                {item.title} <LinkOutlined />
                              </a>
                              {isDownloadable(item) ? (
                                <a
                                  className="material-download"
                                  href={`/api/moodle/download?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(item.title)}`}
                                  download
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  下载
                                </a>
                              ) : null}
                            </div>
                            {item.text ? <Typography.Paragraph type="secondary" className="material-excerpt">{item.text}</Typography.Paragraph> : null}
                          </div>
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
