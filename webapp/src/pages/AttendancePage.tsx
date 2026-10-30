import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App as AntApp, Badge, Button, Card, Checkbox, Empty, Modal, Select, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, FormOutlined, ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import CoveLoader from "../components/CoveLoader";
import {
  cancelAttendanceAssistant,
  fetchAttendanceAssistant,
  fetchAttendanceCodes,
  fetchAttendanceStatus,
  fillAttendanceCode,
  fillAllAttendanceCodes,
  detectAttendancePreferences,
  fetchAttendancePreferences,
  saveAttendancePreferences,
  startAttendanceAssistant,
} from "../data/repository";
import type { AttendanceAssistantState, AttendanceCode, AttendancePreferenceCourse, AttendancePreferences } from "../types";

function courseKey(value: string) {
  return (/^[A-Z]{2,5}\d{3,4}/i.exec(value)?.[0] ?? value).toUpperCase();
}

function sessionKey(value: string) {
  return value.replace(/\b0+(\d+)\b/g, "$1").trim().toLowerCase();
}

interface GroupedCode {
  key: string;
  course: string;
  week: number;
  session: string;
  code: string;
  sources: AttendanceCode[];
  publishedAt: string;
}

function groupCodes(codes: AttendanceCode[]): GroupedCode[] {
  const groups = new Map<string, GroupedCode>();
  for (const item of codes) {
    const key = `${item.course}:${item.week}:${item.session}:${item.code}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.sources.some((source) => source.source === item.source)) existing.sources.push(item);
      if (item.publishedAt > existing.publishedAt) existing.publishedAt = item.publishedAt;
    } else {
      groups.set(key, {
        key,
        course: item.course,
        week: item.week,
        session: item.session,
        code: item.code,
        sources: [item],
        publishedAt: item.publishedAt,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.week - a.week || a.course.localeCompare(b.course) || a.session.localeCompare(b.session));
}

export default function AttendancePage() {
  const { message } = AntApp.useApp();
  const [codes, setCodes] = useState<AttendanceCode[]>([]);
  const [connected, setConnected] = useState(false);
  const [assistant, setAssistant] = useState<AttendanceAssistantState>({ status: "idle", message: "" });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filling, setFilling] = useState<string | null>(null);
  const [fillingAll, setFillingAll] = useState(false);
  const [courseFilter, setCourseFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("latest");
  const [preferences, setPreferences] = useState<AttendancePreferences>({ courses: [] });
  const [detecting, setDetecting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState<AttendancePreferenceCourse[]>([]);
  const autoDetected = useRef(false);

  const load = async (refresh = false) => {
    const [status, nextCodes, nextPreferences] = await Promise.all([
      fetchAttendanceStatus(),
      fetchAttendanceCodes(refresh),
      fetchAttendancePreferences(),
    ]);
    setConnected(status.connected);
    setAssistant(status.assistant);
    setCodes(nextCodes);
    setPreferences(nextPreferences);
  };

  useEffect(() => {
    let active = true;
    void load().catch(() => message.error("无法读取 Attendance 状态")).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const detect = async () => {
    setDetecting(true);
    try {
      const detected = await detectAttendancePreferences();
      const saved = await saveAttendancePreferences(detected);
      setPreferences(saved);
      setCodes(await fetchAttendanceCodes());
      message.success(`已识别你的签到班次：${saved.courses.length} 门课程`);
    } catch (cause) {
      message.warning(cause instanceof Error ? cause.message : "自动识别签到班次失败，可以手动调整");
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (loading || !connected || preferences.courses.length > 0 || autoDetected.current) return;
    autoDetected.current = true;
    void detect();
  }, [loading, connected, preferences.courses.length]);

  useEffect(() => {
    if (assistant.status !== "waiting_login") return;
    const timer = window.setInterval(() => {
      void fetchAttendanceAssistant().then((next) => {
        setAssistant(next);
        if (next.status === "connected") {
          message.success("Attendance 已连接，session 已保存到本机");
          void load();
        }
      }).catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [assistant.status]);

  const start = async () => {
    setStarting(true);
    try {
      setAssistant(await startAttendanceAssistant());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "Attendance 登录助手启动失败");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    setAssistant(await cancelAttendanceAssistant());
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load(true);
      message.success("已刷新 Attendance code（含 Moodle 图片 OCR）");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const fillAll = async () => {
    if (groups.length === 0) return;
    setFillingAll(true);
    try {
      const result = await fillAllAttendanceCodes(groups.map((item) => item.sources[0]));
      message.success(`批量填写完成：已填入 ${result.filled} 个，未开始 ${result.inactive} 个，未找到 ${result.notFound} 个`);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "批量填写失败");
    } finally {
      setFillingAll(false);
    }
  };

  const fill = async (item: GroupedCode) => {
    setFilling(item.key);
    try {
      const result = await fillAttendanceCode(item.sources[0]);
      if (result.status === "filled") {
        message.success(result.message);
      } else if (result.status === "inactive") {
        message.warning(result.message);
      } else {
        message.error(result.message);
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "填写失败");
    } finally {
      setFilling(null);
    }
  };

  const allGroups = useMemo(() => groupCodes(codes), [codes]);
  const sessionOptions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of allGroups) {
      const key = courseKey(item.course);
      const set = map.get(key) ?? new Set<string>();
      set.add(item.session);
      map.set(key, set);
    }
    for (const item of preferences.courses) {
      const set = map.get(item.course) ?? new Set<string>();
      for (const session of item.sessions) set.add(session);
      map.set(item.course, set);
    }
    return map;
  }, [allGroups, preferences]);

  const openManual = () => {
    const draft = [...sessionOptions.entries()].map(([course, sessions]) => {
      const existing = preferences.courses.find((item) => item.course === course);
      return { course, sessions: existing ? [...existing.sessions] : [...sessions] };
    });
    setDraftPreferences(draft);
    setManualOpen(true);
  };

  const saveManual = async () => {
    try {
      const saved = await saveAttendancePreferences({ courses: draftPreferences.filter((item) => item.sessions.length > 0) });
      setPreferences(saved);
      setManualOpen(false);
      message.success("签到班次已保存，后续只显示这些班次的 code");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    }
  };

  const preferred = (course: string, session: string) => {
    if (preferences.courses.length === 0) return true;
    const item = preferences.courses.find((entry) => entry.course === courseKey(course));
    if (!item || item.sessions.length === 0) return true;
    return item.sessions.some((entry) => sessionKey(entry) === sessionKey(session));
  };
  const latestWeek = useMemo(() => Math.max(0, ...allGroups.map((item) => item.week)), [allGroups]);
  const courses = useMemo(() => [...new Set(allGroups.map((item) => item.course))].sort(), [allGroups]);
  const groups = useMemo(
    () => allGroups.filter((item) => {
      if (!preferred(item.course, item.session)) return false;
      if (courseFilter !== "all" && item.course !== courseFilter) return false;
      if (weekFilter === "latest" && item.week !== latestWeek) return false;
      if (weekFilter !== "latest" && item.week !== Number(weekFilter)) return false;
      return true;
    }),
    [allGroups, courseFilter, latestWeek, preferences, weekFilter],
  );
  const waiting = assistant.status === "waiting_login";

  if (loading) return <CoveLoader label="正在整理 attendance code" />;

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            ATTENDANCE
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            签到
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            从 Gmail 和 Moodle 汇总 attendance code。填写是本地代码逻辑，不使用模型；默认只填入，不自动提交。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => void refresh()}>
            刷新 code
          </Button>
          <Button type="link" href="https://attendance.monash.edu.my/student/" target="_blank">
            打开 Attendance
          </Button>
        </Space>
      </header>

      <Card className="attendance-connect-card" title="Attendance 登录">
        <Space wrap>
          <Badge status={connected ? "success" : "default"} text={connected ? "已连接" : "未连接"} />
          {waiting ? (
            <>
              <Typography.Text type="secondary">请在打开的 Chrome 窗口完成 Monash 登录</Typography.Text>
              <Button onClick={() => void cancel()}>取消登录</Button>
            </>
          ) : (
            <Button type="primary" icon={<FormOutlined />} loading={starting} onClick={() => void start()}>
              {connected ? "重新登录 Attendance" : "连接 Attendance"}
            </Button>
          )}
          <Typography.Text type="secondary">只保存 session cookie 到本机 Keychain，不保存密码。</Typography.Text>
        </Space>
        {assistant.status === "error" ? <Alert className="page-alert" type="error" showIcon message={assistant.message} /> : null}
        {assistant.status === "connected" ? <Alert className="page-alert" type="success" showIcon message="Attendance session 已保存；过期后需要重新登录。" /> : null}
      </Card>

      <Card
        className="attendance-connect-card"
        title="我的签到班次"
        extra={(
          <Space wrap>
            <Button size="small" loading={detecting} onClick={() => void detect()}>重新识别</Button>
            <Button size="small" onClick={openManual}>手动调整</Button>
          </Space>
        )}
      >
        {detecting ? <Alert type="info" showIcon message="正在从 Attendance 页面识别你的 Workshop / Applied / Tutorial 班次…" /> : null}
        {preferences.courses.length > 0 ? (
          <Space wrap>
            {preferences.courses.map((item) => (
              <Tag key={item.course} color="green">
                {item.course} · {item.sessions.join(" / ")}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">
            首次连接后会自动从 Attendance 页面识别你的班次；识别失败时点“手动调整”。
          </Typography.Text>
        )}
        <Typography.Paragraph type="secondary" className="attendance-source-note">
          后续只显示你实际参加的班次对应的 attendance code；不同学生会看到不同的 Workshop / Applied。
        </Typography.Paragraph>
      </Card>

      {!connected ? (
        <Alert
          className="page-alert"
          type="info"
          showIcon
          message="先连接 Attendance"
          description="连接后可以自动打开签到页，并在 active code 窗口出现时尝试填入。"
          action={<Button size="small" onClick={() => void start()}>连接</Button>}
        />
      ) : null}

      <div className="attendance-toolbar">
        <Space wrap>
          <Select
            value={courseFilter}
            onChange={setCourseFilter}
            options={[{ value: "all", label: "全部课程" }, ...courses.map((course) => ({ value: course, label: course }))]}
            style={{ width: 180 }}
          />
          <Select
            value={weekFilter}
            onChange={setWeekFilter}
            options={[
              { value: "latest", label: `最新周（Week ${latestWeek || "-"}）` },
              ...[...new Set(allGroups.map((item) => item.week))].sort((a, b) => b - a).map((week) => ({ value: String(week), label: `Week ${week}` })),
            ]}
            style={{ width: 150 }}
          />
          <Typography.Text type="secondary">
            {groups.length} 个 code / {new Set(groups.map((item) => item.course)).size} 门课程
          </Typography.Text>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={fillingAll}
            disabled={!connected || groups.length === 0 || filling !== null}
            onClick={() => void fillAll()}
          >
            {weekFilter === "latest" ? `一键填写当周（${groups.length}）` : `一键填写当前列表（${groups.length}）`}
          </Button>
        </Space>
        <Typography.Text type="secondary">Moodle 图片 code 使用本地 OCR；批量默认只填入，不自动提交。</Typography.Text>
      </div>

      {groups.length === 0 ? (
        <Empty description="还没有解析到 attendance code。先同步 Gmail 或 Moodle。" />
      ) : (
        <div className="attendance-list">
          {groups.map((item) => (
            <Card key={item.key} className="attendance-code-card" size="small">
              <div className="attendance-code-row">
                <div className="attendance-code-main">
                  <Space wrap>
                    <Tag color="green">Week {item.week}</Tag>
                    <Typography.Text strong>{item.course}</Typography.Text>
                    <Tag>{item.session}</Tag>
                    <Typography.Text code className="attendance-code">{item.code}</Typography.Text>
                  </Space>
                  <Typography.Paragraph type="secondary" className="attendance-source-note">
                    来源：{item.sources.map((source) => source.source === "moodle" ? "Moodle" : source.source === "gmail" ? "Gmail" : "Ed").join(" / ")}
                    {" · "}
                    {new Date(item.publishedAt).toLocaleDateString("zh-CN")}
                  </Typography.Paragraph>
                </div>
                <Space>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={filling === item.key}
                    disabled={!connected}
                    onClick={() => void fill(item)}
                  >
                    一键填写
                  </Button>
                  {item.sources[0] ? <Button type="link" href={item.sources[0].url} target="_blank">来源</Button> : null}
                </Space>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Typography.Paragraph type="secondary" className="page-footnote">
        自动填写只会操作 attendance.monash.edu.my；如果当前没有 active code 表单，会提示而不是伪造提交。需要重新登录时，回到本页连接 Attendance。
        <Link to="/settings"> 设置</Link>
      </Typography.Paragraph>
      <Modal
        title="调整我的签到班次"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        onOk={() => void saveManual()}
        okText="保存班次"
        cancelText="取消"
      >
        <Typography.Paragraph type="secondary">
          只勾选你实际参加的 Workshop / Applied / Tutorial。之后签到页只显示这些班次的 code。
        </Typography.Paragraph>
        <div className="attendance-session-editor">
          {draftPreferences.map((item) => (
            <div key={item.course} className="attendance-session-row">
              <Typography.Text strong>{item.course}</Typography.Text>
              <Checkbox.Group
                value={item.sessions}
                options={[...(sessionOptions.get(item.course) ?? [])].map((session) => ({ label: session, value: session }))}
                onChange={(values) => {
                  setDraftPreferences((current) => current.map((entry) => entry.course === item.course ? { ...entry, sessions: values as string[] } : entry));
                }}
              />
            </div>
          ))}
          {draftPreferences.length === 0 ? <Typography.Text type="secondary">还没有可选择的班次；请先在 Attendance 页面确认课程活动。</Typography.Text> : null}
        </div>
      </Modal>
    </>
  );
}
