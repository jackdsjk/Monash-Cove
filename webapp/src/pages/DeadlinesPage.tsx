import { useEffect, useMemo, useState } from "react";
import { App as AntApp, Empty, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import DeadlineCountdown from "../components/DeadlineCountdown";
import CoveLoader from "../components/CoveLoader";
import { fetchBrief, setItemCompleted } from "../data/repository";
import { useDemoStore } from "../state/DemoStateContext";
import type { BriefItem } from "../types";

const HOUR = 3_600_000;

export default function DeadlinesPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const { state, hydrate } = useDemoStore();
  const [items, setItems] = useState<BriefItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchBrief()
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        hydrate(data.items);
      })
      .catch(() => {
        if (active) message.error("无法读取本地截止时间，请确认本地服务正在运行。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrate, message]);

  const markSubmitted = async (id: string) => {
    try {
      await setItemCompleted(id, true);
      setItems(await fetchBrief().then((data) => data.items));
      message.success("已标记为提交完成，倒计时已移除");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "标记失败");
    }
  };

  const open = useMemo(
    () =>
      items.filter(
        (item) =>
          (item.source === "moodle" || item.source === "ontrack") &&
          item.dueAt &&
          Number.isFinite(Date.parse(item.dueAt)) &&
          !item.completedAt &&
          !state.corrections[item.id]?.dismissed,
      ),
    [items, state.corrections],
  );

  const soonCount = useMemo(() => {
    const now = Date.now();
    return open.filter((item) => {
      const remaining = Date.parse(item.dueAt ?? "") - now;
      return remaining > 0 && remaining <= 48 * HOUR;
    }).length;
  }, [open]);

  if (loading) {
    return <CoveLoader label="正在读取截止时间" />;
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__main">
          <Typography.Title level={1} className="page-title">
            截止倒计时
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            来自 Moodle 和 OnTrack 的截止时间；这里只处理有结构化截止日期的条目。
          </Typography.Paragraph>
        </div>
        <div className="page-header__side">
          <div className="board-counters">
            <div className="board-counter board-counter--hot">
              <div className="board-flap">
                <b>{soonCount}</b>
              </div>
              <span>48h 内</span>
            </div>
            <div className="board-counter">
              <div className="board-flap">
                <b>{open.length}</b>
              </div>
              <span>总计</span>
            </div>
          </div>
        </div>
      </header>

      {open.length === 0 ? (
        <Empty
          className="brief-empty"
          description={
            <div>
              <Typography.Title level={2}>暂时没有可计算的截止时间</Typography.Title>
              <Typography.Paragraph type="secondary">
                等 Moodle 同步到带截止时间的作业后，这里会自动出现倒计时。
              </Typography.Paragraph>
            </div>
          }
        />
      ) : (
        <DeadlineCountdown
          items={items}
          corrections={state.corrections}
          onOpen={(id) => navigate("/", { state: { openItemId: id } })}
          onMarkSubmitted={(id) => void markSubmitted(id)}
        />
      )}
    </>
  );
}
