# Monash Cove

[English](README.md) · **简体中文**

面向 Monash 学生的本地优先信息分诊应用：把 Gmail、Ed、Moodle 和 OnTrack 的只读信息整理成一份可核对的简报、一份截止倒计时和一张每周资料表。

所有数据和处理都在本机完成，应用不会向任何服务器上传内容，也不会代替你在学校系统里执行操作。

---

## 1. 这个项目解决什么问题

一个在读学生每天要面对四套系统的信息：学校邮箱、Moodle 课程页、Ed 讨论区和 OnTrack 作业页。其中有通知、有作业要求变更、有导师反馈，也有大量与个人无关的讨论和推广。现有平台只负责"发布"，不负责"判断"，于是判断的成本全部落在学生身上。

Monash Cove 的处理方式是：

1. **只读巡检** —— 在本机以只读权限拉取四个来源的新内容；
2. **分诊** —— 按课程归属、发布者身份、是否改变原有安排，判断每条内容的重要性和是否需要行动；
3. **可核对** —— 每条判断都附带原文引文，能一键跳回来源核对；
4. **记住变化** —— 记录内容本身的变化（截止时间、标题、正文），而不只是"有没有新内容"。

它不替代日历，也不替学生写作业。它替代的是"逐条读完再做判断"这件事。

## 2. 适用对象

**适用**：同时使用 Moodle、学校邮箱、Ed 和 OnTrack，需要定期确认课程动态，但不希望逐条读完所有通知的 Monash 在读学生。

**暂不适用**：

- 非 Monash 用户（来源适配器直接对接 Monash 的 Moodle、Ed 和 OnTrack）；
- 希望应用代为提交作业、回复消息或修改成绩的用户（本项目不提供写操作）；
- 需要多人协作或云端同步的场景（当前是单用户、单机）。

## 3. 功能

### 3.1 简报（首页）

把上次查看之后的内容压缩成三组：**必须处理 / 待确认 / 已折叠**。每条显示来源、课程、到达时间、原文引文和判断标签，点击打开详情抽屉核对原文。支持按来源、类型、课程筛选，以及"只看需要行动""只看未读"。

### 3.2 内容变化追踪

每次同步会与库中已有版本比较，记录字段级变化（截止时间、标题、课程、正文）。简报顶部以可折叠列表展示"自上次查看，哪几条内容变过"，并给出改动前后的值。变化记录保留 90 天，首次导入的内容不会被误记为变化。

### 3.3 截止倒计时

汇总 Moodle 与 OnTrack 的截止日期，按 **已截止 / 24 小时内 / 三天内 / 更晚** 分组。每条截止项是一张方形卡片，内含按秒翻牌的倒计时；标记为已提交后自动移出列表。

### 3.4 每周资料

按课程和周次整理的资料表，列出讲义、录像、作业说明和通知，支持按课程、类型筛选、批量选择与下载。

### 3.5 OnTrack

独立的 OnTrack 页面，包含：

- **任务表**：编号、名称、状态、截止日期、权重，按 P / C / D / HD 等级筛选；
- **任务对话**：点击任一任务，在侧边抽屉中按时间正序展开你与导师的完整对话，状态流转与计划调整显示为系统行；
- **导师反馈**：导师评语与自动评分结果，支持按任务筛选、完整阅读；
- **下载**：任务资源包、已提交的 PDF。

### 3.6 Ed 学习

按 lesson 浏览 Ed 上的视频、文字和附件：视频跳转原页，文字生成 Markdown，PPT / PDF 下载，支持整课打包。

### 3.7 签到

从 Gmail 与 Moodle 汇总 attendance code；Moodle 图片使用内置 Tesseract.js（WASM）做本地 OCR，识别结果可人工核对。

### 3.8 数据源与登录有效期

集中管理四个来源的连接状态，并显示每个来源的**凭据有效期**：Gmail 到期自动续期；Ed 与 Moodle 无固定到期，失效时提示重连；OnTrack 通过刷新凭据自动换取短时 token。

### 3.9 本地 MCP（可选）

`local-service` 另外暴露一个只读 MCP 接口（stdio 或 Streamable HTTP），外部 Agent 可以读取简报、截止时间、来源状态和课程资料。接入方式见 [docs/mcp.md](docs/mcp.md)。

## 4. 数据来源

| 来源 | 接入方式 | 权限 | 凭据位置 | 有效期 |
|---|---|---|---|---|
| Gmail | Google OAuth（`gmail.readonly`） | 只读邮件与线程 | 本机 Keychain | 1 小时，自动续期 |
| Ed | Ed API token | 只读课程讨论 | 本机 Keychain | 平台未公布 |
| Moodle | Chrome 登录助手，捕获会话 Cookie | 只读课程页与文件 | 本机 Keychain | 平台未公布 |
| OnTrack | Chrome 登录助手，捕获刷新凭据 | 只读任务、反馈与文件 | 本机 Keychain | 自动换取短时 token |

四个来源均为只读。应用不发送邮件、不提交作业、不修改任务状态。

## 5. 架构

```text
┌─────────────┐     HTTP/JSON      ┌──────────────────┐     HTTPS      ┌──────────┐
│   webapp    │ ─────────────────▶ │  local-service   │ ─────────────▶ │ 学校系统  │
│ React+AntD  │ ◀───────────────── │ Fastify + SQLite │ ◀───────────── │ 只读接口  │
└─────────────┘                    └──────────────────┘                └──────────┘
        │                                    │
        │                                    └─ Keychain（凭据）
        └─ 浏览器界面                         └─ SQLite（条目、判断、变化记录）
```

- **webapp**：Vite + React 19 + Ant Design 6，纯前端，不持有任何凭据；
- **local-service**：Node 26 + Fastify + `node:sqlite`，负责来源接入、同步、分诊、变化记录和下载；
- **desktop**：Electron 桌面壳，复用同一套 local-service 与 webapp。

## 6. 快速开始

### 前置条件

- Node.js 26 或以上；
- Google Chrome（Moodle 与 OnTrack 的登录助手依赖它）；
- macOS（当前唯一完整验证过的平台）；
- 一个 Monash 账号。

### 一键启动

```bash
./start-cove.sh
```

脚本会按需安装依赖、构建前后端，然后以生产模式启动本地服务，并在 <http://127.0.0.1:4317/> 提供界面（macOS 会自动打开浏览器）。

### 手动启动

```bash
# 终端一：本地服务
cd local-service && npm install && npm run dev

# 终端二：Web App
cd webapp && npm install && npm run dev
```

开发模式使用 Vite 开发服务器，打开 <http://127.0.0.1:5174/>；`local-service` 在 4317 提供 `/api`，由 Vite 代理。

### 首次配置

1. 进入「数据源」，依次连接 Gmail、Ed、Moodle、OnTrack；
2. 执行一次全量同步；
3. 回到「简报」开始使用。之后每次打开应用会自动做增量同步。

## 7. 项目结构

| 目录 | 内容 |
|---|---|
| `webapp/` | Web 前端（简报、倒计时、资料、OnTrack、Ed、签到、数据源、设置） |
| `local-service/` | 本地服务：来源适配器、同步编排、SQLite、HTTP 与 MCP 接口 |
| `desktop/` | Electron 桌面壳与打包配置 |
| `demo/` | 匿名静态原型（不含真实登录与同步） |
| `docs/` | 产品定义、设计规范、安装说明、接入文档与开发记录 |
| `redesign/` | 界面改版方向稿（静态 HTML，供设计参考） |
| `scripts/` | 评测与运维脚本 |

## 8. 隐私与安全边界

- 真实凭据只写入本机 Keychain，不进入仓库、不进入浏览器；
- 邮件正文、课程内容、判断结果与变化记录只存在本机 SQLite（`~/Library/Application Support/Cove/cove.sqlite`）；
- 本公开仓库不包含真实 token、Cookie、数据库或账户信息；
- 应用的网络请求仅指向学校系统与 Google 的只读接口；
- 未实现任何写操作，不存在误提交、误回复的风险。

## 9. 开发与验证

```bash
# 本地服务：单元测试 + 构建
cd local-service && npm run check

# Web 前端：数据校验 + 类型检查 + 构建
cd webapp && npm run check

# 端到端冒烟
cd webapp && npm run e2e
```

## 10. 当前状态与已知限制

**已用真实账号验证**：四个来源的接入、同步、分诊、变化追踪、OnTrack 任务与对话、资料下载。

**未验证或存在限制**：

- Windows 桌面包未在真实 Windows 机器上测试；
- macOS Electron 包未签名，正式分发需要 Developer ID 与 notarization；
- Gmail 的增量同步只读取游标之后的新邮件，历史邮件的编辑不会被重新读取（Gmail 邮件本身不可编辑，影响有限）；
- OnTrack 的截止时间按 +08:00 当日 23:59 计算，跨校区使用时需要按校区调整；
- 尚无外部用户研究，评测基于历史数据回放与自用测试。

## 11. 文档

- 文档导航：[docs/README.md](docs/README.md)
- 产品定义：[docs/PRD-Monash-Agent.md](docs/PRD-Monash-Agent.md)
- 设计规范：[docs/webapp-design.md](docs/webapp-design.md)
- 本地服务：[local-service/README.md](local-service/README.md)
- Web 前端：[webapp/README.md](webapp/README.md)
- 桌面安装：[docs/desktop-install.md](docs/desktop-install.md)
- MCP 接入：[docs/mcp.md](docs/mcp.md)

## 12. 许可

本仓库目前未声明开源许可。在补充许可证之前，默认保留所有权利；如需引用或复用，请先联系仓库所有者。
