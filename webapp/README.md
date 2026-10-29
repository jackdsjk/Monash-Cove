# Cove Web App

本地优先的 Cove Web App 骨架。它用 Vite + React + TypeScript + Ant Design v6 实现简报、详情、纠错、数据源和设置页面，目前使用匿名样本和预录模型输出，不连接真实账号。

## 运行

```bash
cd webapp
npm install
npm run dev
```

打开 <http://127.0.0.1:5174/>。

生产构建：

```bash
npm run build
npm run preview
```

## 当前范围

- `/`：Since Last Check 简报，含注意力分组、来源筛选、搜索、只看需要行动、详情 Drawer 和反馈 Modal；
- `/sources`：三个来源的只读状态和接入边界说明；
- `/settings`：本地状态、清除演示数据和隐私说明；
- 数据来自 `src/data/demo-data.json`：55 条匿名改写样本 + 2026-10-29 的 `gpt-5.6-luna` 预录判断；
- 状态只写入浏览器 `localStorage`，没有后端、账号、OAuth 或同步。

## 目录

```text
webapp/
├── src/
│   ├── components/     # AppShell、卡片、Drawer、反馈 Modal
│   ├── data/           # 匿名 fixture 和 repository 边界
│   ├── lib/            # 纯分诊、筛选、汇总和格式化逻辑
│   ├── pages/          # 简报、数据源、设置
│   ├── state/          # localStorage 状态和 corrections
│   ├── theme.ts        # Ant Design token 和 Cove 主题
│   ├── App.tsx
│   └── main.tsx
├── scripts/check-data.mjs
└── vite.config.ts
```

`src/data/repository.ts` 是后续替换为本地 Node API 的边界；页面只依赖 `fetchBrief()` 返回的条目列表。

## 设计依据

实现参考 [Web App 设计规范](../docs/webapp-design.md)：

- Ant Design v6 的 token、4px 网格和组件语义；
- 14px 正文、400/600 字重、6/8px 圆角；
- 232px 固定侧栏、单列简报、640px 详情 Drawer；
- 主色 `#1F5A46`，critical 使用状态徽标而不是小号彩色 tag；
- 一个页面一个 primary 按钮。

## 验证

```bash
npm run check
```

`check` 会校验 fixture 完整性（55 条、唯一 ID、证据句是原文子串）并执行 TypeScript 构建。

浏览器检查：桌面 1280×800 和移动 390×844；axe 自动检查 0 violations；控制台无应用错误。

## 已知边界

- 没有真实 OAuth、同步、来源链接或本地后端；
- 模型判断是预录快照，不是实时推理；
- 语义去重、教师结论提炼、OnTrack、提醒、问答和 MCP 未实现；
- 目前是本地 Web App，不是 Electron/Tauri 桌面壳；
- 构建产物约 900KB（Ant Design + React），后续按路由/组件做拆包；
- `localStorage` 只适合演示，不是最终的本地数据存储方案。
