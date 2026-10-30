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

打开 <http://127.0.0.1:5174/>。首次连接后在“数据源”点“首次全量同步”；完成后打开 App 会自动做最多每 5 分钟一次的增量同步。Vite 会把 `/api` 代理到 `127.0.0.1:4317`。

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
- 页面切换/刷新时使用 Cove 品牌动态 loader（旋转轨道 + 呼吸核心 + 三点节奏）；
- 顶栏“搜索或跳转”：`Cmd/Ctrl+K` 命令面板，可跳转简报、倒计时、每周资料、数据源、设置；
- `/materials`：独立的“每周资料”页面，按 Moodle 课程板块列出资料、作业/考核、公告/讨论和说明文字；资料行支持单选、全选筛选结果和“下载选中”（批量 ZIP，仅 Moodle resource 文件）；页面提供搜索、类型（资料/作业/公告/说明）和板块筛选；ASSESSMENTS 板块的资源归入“作业/考核”。
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
cd ../webapp && npm run e2e
```

`check` 校验 local-service fixture 完整性和 TypeScript 构建；`e2e` 启动独立的生产服务（端口 4318）+ 临时 SQLite，跑简报、详情、反馈、标记已查看和导航。简报页“同步全部来源”会真实调用 `/api/sync` 三次。

## 已知边界

- Gmail 20、Ed 91、Moodle 6 已真实同步；Moodle 当前课程无论坛链接；没有凭据时只用 fixture/mock；
- Moodle 论坛解析基于 HTML fixture，真实页面结构仍需 S8 smoke；
- 模型默认回退规则；真实模型 key 未配置时不会调用外部 API；
- 构建包约 960KB，Vite 有 chunk 警告；
- 移动端采用 72px 图标栏，不是顶部导航抽屉；
- 没有 Electron/Tauri 桌面壳。
