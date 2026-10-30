import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntApp, Badge, Button, Card, Empty, Select, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, FormOutlined, ReloadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import CoveLoader from "../components/CoveLoader";
import {
  cancelAttendanceAssistant,
  fetchAttendanceAssistant,
  fetchAttendanceCodes,
  fetchAttendanceStatus,
  fillAttendanceCode,
  startAttendanceAssistant,
} from "../data/repository";
import type { AttendanceAssistantState, AttendanceCode } from "../types";

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
  const [courseFilter, setCourseFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("latest");

  const load = async (refresh = false) => {
    const [status, nextCodes] = await Promise.all([fetchAttendanceStatus(), fetchAttendanceCodes(refresh)]);
    setConnected(status.connected);
    setAssistant(status.assistant);
    setCodes(nextCodes);
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
  const latestWeek = useMemo(() => Math.max(0, ...allGroups.map((item) => item.week)), [allGroups]);
  const courses = useMemo(() => [...new Set(allGroups.map((item) => item.course))].sort(), [allGroups]);
  const groups = useMemo(
    () => allGroups.filter((item) => {
      if (courseFilter !== "all" && item.course !== courseFilter) return false;
      if (weekFilter === "latest" && item.week !== latestWeek) return false;
      if (weekFilter !== "latest" && item.week !== Number(weekFilter)) return false;
      return true;
    }),
    [allGroups, courseFilter, latestWeek, weekFilter],
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
        </Space>
        <Typography.Text type="secondary">Moodle 图片 code 使用本地 OCR；默认不自动提交。</Typography.Text>
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
    </>
  );
}
