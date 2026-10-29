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

打开 <http://127.0.0.1:5174/>。Vite 会把 `/api` 代理到 `127.0.0.1:4317`。

生产模式：

```bash
cd webapp && npm run build
cd ../local-service && npm run build
./start-cove.sh
# 或 COVE_STATIC_DIR=../webapp/dist npm start
```

## 当前范围

- `/`：Since Last Check 简报、注意力分组、来源筛选、搜索、只看需要行动、详情 Drawer、反馈 Modal；
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

`check` 校验 local-service fixture 完整性和 TypeScript 构建；`e2e` 启动独立的生产服务（端口 4318）+ 临时 SQLite，跑简报、详情、反馈、标记已查看、模拟同步和导航。

## 已知边界

- 真实 Gmail/Ed/Moodle 需要用户在 S8 提供凭据并完成登录；没有凭据时只用 fixture/mock；
- Moodle 论坛解析基于 HTML fixture，真实页面结构仍需 S8 smoke；
- 模型默认回退规则；真实模型 key 未配置时不会调用外部 API；
- 构建包约 960KB，Vite 有 chunk 警告；
- 移动端采用 72px 图标栏，不是顶部导航抽屉；
- 没有 Electron/Tauri 桌面壳。
