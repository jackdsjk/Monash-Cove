import { DeleteOutlined } from "@ant-design/icons";
import { Alert, App as AntApp, Button, Card, Descriptions, Popconfirm, Space, Tag, Typography } from "antd";
import { demoData } from "../data/demo-data";
import { useDemoStore } from "../state/DemoStateContext";

export default function SettingsPage() {
  const { message } = AntApp.useApp();
  const { state, reset } = useDemoStore();

  const clear = () => {
    reset();
    message.success("演示状态已清除");
  };

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            本地模式
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            设置
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            控制本地演示状态和查看数据边界。第一版没有账号、云端同步或第三方分析。
          </Typography.Paragraph>
        </div>
      </header>

      <Card title="本地数据">
        <Descriptions
          size="small"
          column={2}
          colon={false}
          items={[
            { key: "items", label: "样本条目", children: `${demoData.items.length} 条` },
            { key: "window", label: "查看窗口", children: state.windowHours === 0 ? "上次查看后（无新内容）" : `${state.windowHours} 小时` },
            { key: "corrections", label: "纠错记录", children: `${Object.keys(state.corrections).length} 条` },
            { key: "read", label: "已读条目", children: `${Object.keys(state.read).length} 条` },
          ]}
        />
        <Space className="settings-actions" wrap>
          <Popconfirm title="清除全部演示状态？" description="包括置顶、折叠、反馈和查看时间。" okText="清除" cancelText="取消" onConfirm={clear}>
            <Button danger icon={<DeleteOutlined />}>
              清除演示状态
            </Button>
          </Popconfirm>
          <Tag>localStorage only</Tag>
        </Space>
      </Card>

      <Card className="info-card" title="边界">
        <Alert
          type="warning"
          showIcon
          message="敏感数据不在这个演示里"
          description="当前只有匿名改写样本和预录模型判断。真实接入后，凭据、会话和同步数据必须留在本机，并由本地服务管理。"
        />
        <Typography.Paragraph type="secondary" className="settings-note">
          产品不会自动提交作业、回复教师或代表用户发消息。高风险结论必须能回到原文。
        </Typography.Paragraph>
      </Card>
    </>
  );
}
