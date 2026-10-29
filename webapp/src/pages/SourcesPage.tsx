import { ApiOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Alert, App as AntApp, Badge, Button, Card, Col, Descriptions, Row, Space, Tag, Typography } from "antd";
import { demoData } from "../data/demo-data";
import { SOURCE_LABELS } from "../lib/triage";
import type { Source } from "../types";

const sources: Array<{ source: Source; status: "success" | "warning"; lastSync: string; scope: string }> = [
  { source: "gmail", status: "success", lastSync: "12 分钟前", scope: "只读邮件与线程" },
  { source: "ed", status: "success", lastSync: "18 分钟前", scope: "只读课程讨论" },
  { source: "moodle", status: "warning", lastSync: "2 小时前", scope: "只读 assessment 与公告" },
];

export default function SourcesPage() {
  const { message } = AntApp.useApp();

  return (
    <>
      <header className="page-header">
        <div>
          <Typography.Text className="eyebrow" type="secondary">
            本地模式
          </Typography.Text>
          <Typography.Title level={1} className="page-title">
            数据源
          </Typography.Title>
          <Typography.Paragraph className="page-subtitle" type="secondary">
            只读连接校园来源，确认同步状态和失败原因。第一版不提供代发消息、提交作业或修改源数据的能力。
          </Typography.Paragraph>
        </div>
      </header>

      <Alert
        className="page-alert"
        type="info"
        showIcon
        message="当前是本地演示数据"
        description="真实 OAuth、会话和同步会在本地 Node 服务接入后启用。现在展示的是 55 条匿名样本的预录结果。"
      />

      <Row gutter={[16, 16]}>
        {sources.map((config) => {
          const count = demoData.items.filter((item) => item.source === config.source).length;
          return (
            <Col xs={24} md={8} key={config.source}>
              <Card
                title={
                  <Space>
                    <span className={`source-dot source-dot--${config.source}`} />
                    <span>{SOURCE_LABELS[config.source]}</span>
                  </Space>
                }
                extra={<Badge status={config.status} text={config.status === "success" ? "已连接" : "需检查"} />}
              >
                <Descriptions
                  size="small"
                  column={1}
                  colon={false}
                  items={[
                    { key: "last", label: "最近同步", children: config.lastSync },
                    { key: "scope", label: "读取范围", children: config.scope },
                    { key: "count", label: "样本数", children: `${count} 条` },
                  ]}
                />
                <Space className="source-actions" wrap>
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    只读
                  </Tag>
                  <Button
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={() => message.info("真实同步需要本地 Node 服务，当前演示数据不会访问账号")}
                  >
                    立即同步
                  </Button>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card className="info-card" title="接入边界">
        <Typography.Paragraph type="secondary">
          真实接入时，登录、凭据和同步都在本机完成；页面只读取本地服务整理后的简报。Ed 和 Moodle 的会话、Gmail 的 OAuth
          回调不应暴露给浏览器渲染进程。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          下一步：接入本地 Node 服务，先打通一个来源的纵向切片，再扩展到三个来源。
        </Typography.Paragraph>
      </Card>
    </>
  );
}
