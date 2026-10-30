# Cove

Cove 是一个本地优先的校园信息分诊应用：把 Gmail、Ed 和 Moodle 的只读信息整理成可核对的简报、截止倒计时和每周资料。

## 结构

- `webapp/`：Vite + React + TypeScript + Ant Design 前端；
- `local-service/`：Node + Fastify + SQLite 本地服务，负责来源凭据、同步、分诊、资料索引和下载；
- `docs/`：产品方向、设计、执行计划和 UI 审计；
- `demo/`：匿名静态原型。

## 本地运行

```bash
cd local-service
npm install
npm run dev
```

另开一个终端：

```bash
cd webapp
npm install
npm run dev
```

打开 <http://127.0.0.1:5174/>。首次使用在“数据源”连接账号并执行全量同步；之后打开 App 会做增量同步。

## 隐私边界

- 真实凭据、SQLite、邮件正文和个人数据只保存在本机；
- 这个公开仓库不包含真实 token、cookie、数据库或账户信息；
- Gmail 使用 `gmail.readonly`，Ed/Moodle 只读；
- 不自动提交作业、发送消息或代表用户操作。

## 验证

```bash
cd local-service && npm test
cd ../webapp && npm run check
cd ../webapp && npm run e2e
```
