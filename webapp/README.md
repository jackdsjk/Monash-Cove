# Cove Web App

Cove 的本地 Web App：Vite + React + TypeScript + Ant Design v6。它通过本地 Node API 读取数据，不再直接 import fixture；真实账号凭据由 `local-service` 管理。

## 运行

先启动本地服务：

```bash
cd local-service
npm install
npm run dev
```

再启动 UI：

```bash
cd webapp
npm install
npm run dev
```

打开 <http://127.0.0.1:5174/>。首次设置展示真实来源连接流程，也可明确跳过、稍后连接；全量同步在“设置”中发起。Vite 会把 `/api` 代理到 `127.0.0.1:4317`。

生产模式：

```bash
cd webapp && npm run build
cd ../local-service && npm run build
./start-cove.sh
# 或 COVE_STATIC_DIR=../webapp/dist npm start
```

## 当前范围

- `/`：Since Last Check 简报、注意力分组、来源/类型/课程/未读筛选、搜索、详情 Drawer、反馈 Modal；
- 过去内容默认折叠在“过去的内容”里，可展开并按 20 条继续加载，不打断当前简报；
- `/deadlines`：独立的“倒计时”侧栏页面，按 Moodle 作业的 `dueAt` 自动分成已截止、24 小时内、7 天内、更晚；倒计时精确到秒，每秒更新；没有结构化截止时间就不显示；
- 设置页集中个人称呼/地区、全量同步、本地数据清理和产品边界；
- 共享日期格式化显式使用设置中的 IANA 时区，修改即时生效；发布时间与首次发现时间独立，旧内容新入库可进入“自上次查看”；
- 详情使用 Ant Design Drawer 和 MIT 许可的 `focus-trap 8.2.4`（间接依赖 tabbable），焦点限制在 dialog panel，支持 Escape 并恢复原触发按钮；当前 rc-drawer 自带约束在浏览器边界测试中不完整，因此只让 Drawer 负责关闭恢复，避免双重焦点恢复；
- 数据源页只保留来源连接、状态和增量同步，全量同步移至设置；
- 每周资料支持马来西亚 / 澳大利亚 / 印度尼西亚地区筛选，过滤显式标注其他校区的 section 和资料；
- 下载文件使用 Moodle 资料标题和真实扩展名，批量 ZIP 使用课程/板块命名；
- `/setup`：首次设置复用真实来源页，支持 Gmail OAuth、Ed token、Moodle/OnTrack 登录助手；完成或跳过后可进入简报。匿名示例明确标识为示例，不视为账号已连接；
- 页面切换/刷新时使用 Cove 品牌动态 loader（旋转轨道 + 呼吸核心 + 三点节奏）；
- 顶栏“搜索或跳转”：`Cmd/Ctrl+K` 命令面板，可跳转简报、倒计时、每周资料、数据源、设置；
- `/materials`：独立的“每周资料”页面，按 Moodle 课程板块列出资料、作业/考核、公告/讨论和说明文字；资料行支持单选、全选筛选结果和“下载选中”（批量 ZIP，仅 Moodle resource 文件）；页面提供搜索、类型（资料/作业/公告/说明）和板块筛选；ASSESSMENTS 板块的资源归入“作业/考核”。
- “每周资料”的“同步范围”支持学期、隐藏与置顶课程，影响批量资料和成绩读取；浏览仍保留全部课程，未知学期不排除，单课同步可手动执行。设置按当前连接隔离，保存失败会保留草稿并提示。
- 成绩、资料、Ed、OnTrack 页面保留共享查询结果并显示上次成功时间及后台更新状态；返回已读页面无需重新等待上游，刷新失败保留旧数据。Ed 详情逐批展示，全部详情未齐时禁用整课下载。
- `/sources`：Gmail OAuth、Ed token、Moodle session、来源状态和同步；
- `/settings`：本地状态、清除数据和隐私说明；
- 数据由本地 API 返回；SQLite 和凭据在 `local-service`，浏览器只保留查看窗口偏好；
- 没有云同步、账号体系或桌面壳。

## 目录

```text
webapp/
├── src/
│   ├── components/     # AppShell、卡片、Drawer、反馈 Modal
│   ├── data/           # API repository，唯一数据入口
│   ├── lib/            # 纯展示规则：分组、筛选、汇总
│   ├── pages/          # 简报、数据源、设置
│   ├── state/          # 查看窗口和 UI 状态缓存
│   ├── theme.ts        # Ant Design token 和 Cove 主题
│   └── main.tsx
├── e2e/smoke.mjs       # Playwright 生产模式 E2E
└── scripts/check-data.mjs
```

## 验证

```bash
cd local-service && npm test && npm run build
cd ../webapp && npm run check
cd ../webapp && npm exec vitest run
cd ../webapp && npm run e2e
```

`check` 校验 local-service fixture 完整性、类型及生产构建，不包含 Vitest。`e2e` 使用随机端口、临时 SQLite、内存凭据及隔离 OnTrack 目录，阻断外网；示例和无连接首次运行分别验证，不访问用户正在运行的实例。覆盖首次设置、旧文章新发现、同步失败、实时改时区、390/768/1280px 页面和操作边界、详情焦点及真实连接表单入口（只打开并取消）。简报增量同步仅请求已连接来源，HTTP 失败保留错误，成功时间由服务返回。可通过 `COVE_E2E_ARTIFACT_DIR` 保存稳定转场后的匿名截图；使用项目忽略的 `build/audit/`。

## 已知边界

- Gmail 20、Ed 91、Moodle 6 的历史真实同步记录见执行日志；本次修复使用隔离 fixture/mock 验证，未重新访问真实账号。没有凭据时默认空数据，示例需在后端显式启用；
- Moodle 论坛解析基于 HTML fixture，真实页面结构仍需 S8 smoke；
- 模型默认回退规则；真实模型 key 未配置时不会调用外部 API；
- 主 JS 包约 579 kB（gzip 184 kB），Vite 仍有超过 500 kB 的 chunk 提示；
- 移动端采用 72px 图标栏，不是顶部导航抽屉；
- 没有 Electron/Tauri 桌面壳。
