import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntApp, Button, Card, Empty, Input, Select, Space, Tag, Typography } from "antd";
import { DownloadOutlined, LinkOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import CoveLoader from "../components/CoveLoader";
import { fetchEdCourses, fetchEdLesson, fetchEdLessons } from "../data/repository";
import type { EdCourse, EdLessonDetail, EdLessonSummary, EdMaterialSlide } from "../types";

const TYPE_LABELS: Record<EdMaterialSlide["type"], string> = {
  video: "视频",
  text: "文字",
  slides: "PPT",
  file: "文件",
  quiz: "Quiz",
};

function downloadBlob(name: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "ed-material";
}

export default function EdMaterialsPage() {
  const { message } = AntApp.useApp();
  const [courses, setCourses] = useState<EdCourse[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [lessons, setLessons] = useState<EdLessonSummary[]>([]);
  const [lessonId, setLessonId] = useState<number | null>(null);
  const [lesson, setLesson] = useState<EdLessonDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchEdCourses();
      setCourses(next);
      const preferred = next.find((course) => /FIT1047/i.test(course.code)) ?? next[0];
      if (preferred) setCourseId(preferred.id);
      else setLoading(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取 Ed 课程");
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    setLoading(true);
    setError(null);
    void fetchEdLessons(courseId)
      .then((next) => {
        if (!active) return;
        setLessons(next);
        setLessonId(next[0]?.id ?? null);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "无法读取 Ed lessons");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    if (!lessonId) {
      setLesson(null);
      return;
    }
    let active = true;
    setLoadingLesson(true);
    void fetchEdLesson(lessonId)
      .then((next) => {
        if (active) setLesson(next);
      })
      .catch((cause) => {
        if (active) message.error(cause instanceof Error ? cause.message : "无法读取 Ed lesson");
      })
      .finally(() => {
        if (active) setLoadingLesson(false);
      });
    return () => {
      active = false;
    };
  }, [lessonId, message]);

  const visibleLessons = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return lessons;
    return lessons.filter((item) => item.title.toLowerCase().includes(needle));
  }, [lessons, query]);

  const slides = lesson?.slides ?? [];
  const fileCount = slides.reduce((count, slide) => count + slide.files.length, 0);
  const videoCount = slides.filter((slide) => slide.videoUrls.length > 0).length;

  const downloadMarkdown = (slide: EdMaterialSlide) => {
    downloadBlob(`${safeName(slide.title)}.md`, new Blob([slide.markdown], { type: "text/markdown;charset=utf-8" }));
  };

  const downloadLesson = async () => {
    if (!lesson) return;
    setDownloading(true);
    try {
      const markdown = `# ${lesson.title}\n\n${slides.map((slide) => slide.markdown).join("\n\n---\n\n")}`;
      const files = slides.flatMap((slide) => slide.files.map((file) => ({ name: file.name, url: file.url })));
      const response = await fetch("/api/ed/download-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonTitle: lesson.title, markdown, files }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `打包下载失败：HTTP ${response.status}`);
      }
      downloadBlob(`${safeName(lesson.title)}.zip`, await response.blob());
      message.success(files.length > 0 ? `已打包文字和 ${files.length} 个文件` : "已打包 lesson 文字");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "打包下载失败");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <CoveLoader label="正在读取 Ed 学习内容" />;

  return (
    <>
      <header className="page-header materials-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">ED LEARNING</Typography.Text>
          <Typography.Title level={1} className="page-title">Ed 学习内容</Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            按 lesson 浏览视频、文字和附件；视频跳转，文字可下载 Markdown，PPT/PDF 可直接下载或整课打包。
          </Typography.Paragraph>
        </div>
        <Space wrap className="materials-actions">
          <Select
            value={courseId ?? undefined}
            placeholder="选择 Ed 课程"
            options={courses.map((course) => ({ value: course.id, label: `${course.code} · ${course.name}` }))}
            onChange={setCourseId}
            showSearch
            optionFilterProp="label"
            className="ed-course-select"
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadCourses()}>刷新课程</Button>
        </Space>
      </header>

      {error ? <Alert className="page-alert" type="warning" showIcon message="Ed 内容未就绪" description={error} /> : null}

      <div className="ed-layout">
        <aside className="ed-lesson-panel">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索 lesson"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="ed-lesson-list">
            {visibleLessons.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`ed-lesson-button ${item.id === lessonId ? "is-active" : ""}`}
                onClick={() => setLessonId(item.id)}
              >
                <span>{item.title}</span>
                <Tag>{item.slideCount}</Tag>
              </button>
            ))}
            {visibleLessons.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的 lesson" /> : null}
          </div>
        </aside>

        <main className="ed-slide-panel">
          {loadingLesson ? <CoveLoader label="正在读取 lesson 内容" /> : null}
          {!loadingLesson && lesson ? (
            <>
              <div className="ed-lesson-header">
                <div>
                  <Typography.Title level={2}>{lesson.title}</Typography.Title>
                  <Space wrap>
                    <Tag>{slides.length} 个内容</Tag>
                    <Tag color="blue">{videoCount} 个视频</Tag>
                    <Tag color="gold">{fileCount} 个附件</Tag>
                  </Space>
                </div>
                <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={() => void downloadLesson()}>
                  打包整课
                </Button>
              </div>

              <div className="ed-slides">
                {slides.map((slide) => (
                  <Card key={slide.id} className="ed-slide-card" size="small">
                    <div className="ed-slide-head">
                      <Space wrap>
                        <Tag color={slide.type === "video" ? "blue" : slide.type === "slides" ? "gold" : "default"}>
                          {TYPE_LABELS[slide.type]}
                        </Tag>
                        <Typography.Text strong>{slide.title}</Typography.Text>
                      </Space>
                      <Button type="link" size="small" href={slide.url} target="_blank" rel="noreferrer">
                        打开 Ed <LinkOutlined />
                      </Button>
                    </div>
                    {slide.text ? <Typography.Paragraph className="ed-slide-text">{slide.text}</Typography.Paragraph> : null}
                    <Space wrap className="ed-slide-actions">
                      {slide.videoUrls.map((url, index) => (
                        <Button key={url} type="primary" icon={<PlayCircleOutlined />} href={url} target="_blank" rel="noreferrer">
                          {slide.videoUrls.length > 1 ? `打开视频 ${index + 1}` : "打开视频"}
                        </Button>
                      ))}
                      {slide.type === "text" || slide.text ? (
                        <>
                          <Button href={slide.url} target="_blank" rel="noreferrer">查看文字</Button>
                          <Button icon={<DownloadOutlined />} onClick={() => downloadMarkdown(slide)}>下载 MD</Button>
                        </>
                      ) : null}
                      {slide.files.map((file) => (
                        <Button
                          key={file.url}
                          icon={<DownloadOutlined />}
                          href={`/api/ed/download?url=${encodeURIComponent(file.url)}&name=${encodeURIComponent(file.name)}`}
                        >
                          下载 {file.kind === "slides" ? "PPT" : file.name}
                        </Button>
                      ))}
                      {slide.type === "quiz" ? <Button href={slide.url} target="_blank" rel="noreferrer">打开 Quiz</Button> : null}
                    </Space>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
          {!loadingLesson && !lesson ? <Empty description="选择左侧 lesson 查看学习内容" /> : null}
        </main>
      </div>
    </>
  );
}
