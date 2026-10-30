import { useEffect, useMemo, useState } from "react";
import { App as AntApp, Empty, Tag, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import DeadlineCountdown from "../components/DeadlineCountdown";
import CoveLoader from "../components/CoveLoader";
import { fetchBrief } from "../data/repository";
import { useDemoStore } from "../state/DemoStateContext";
import type { BriefItem } from "../types";

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

  const count = useMemo(
    () => items.filter((item) => item.source === "moodle" && item.dueAt && !state.corrections[item.id]?.dismissed).length,
    [items, state.corrections],
  );

  if (loading) {
    return <CoveLoader label="正在读取截止时间" />;
  }

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            DEADLINES
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            截止倒计时
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            根据 Moodle 作业的截止时间自动生成；这里只处理有结构化截止时间的条目。
          </Typography.Paragraph>
        </div>
        <Tag icon={<ClockCircleOutlined />} className="deadline-page-tag">
          {count} 个截止项
        </Tag>
      </header>

      {count === 0 ? (
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
          showHeading={false}
          onOpen={(id) => navigate("/", { state: { openItemId: id } })}
        />
      )}
    </>
  );
}
