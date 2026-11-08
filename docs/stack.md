# 本机工具栈：装了什么、怎么调用、怎么扩展

*2026-10-26 · 对应 [ecosystem.md](ecosystem.md) 第五节的"第 1–3 步"*

*当天已完成：Moodle / Ed / OnTrack 三通道登录验证，edstem MCP 接入 Codex 与 DSH，Moodle 会话自动续期。*

---

## 一、已安装

| 工具 | 版本 | 位置 | 许可 | 作用 |
|---|---|---|---|---|
| `moodle` | 0.11.0 | `stack/tools/node_modules/.bin/` | MIT | 读 Moodle：截止、公告、成绩、论坛、cal、文件 |
| `edstem` | 0.8.2 | 同上 | MIT | 读/写 Ed：线程、回复、Lessons、slides、文件 |
| `ontrack` | 0.3.2 | 同上 | MIT | OnTrack 任务、提交、chat |
| `unicorn` | 源码 | `stack/unicorn/` | Apache-2.0 | 记忆层：小时级读取、差量事件、14 个 MCP 工具 |

依赖已 `npm install` 完毕（174 包）。**`npm run setup` 未执行** —— 它要交互式登录 Cloudflare 并建 D1 数据库，需要你本人操作。

---

## 二、怎么调用

```bash
source env.sh          # 把 stack/tools/node_modules/.bin 放到 PATH 最前
moodle --version       # 0.11.0
```

> ⚠️ 系统里还有一个**旧的全局 `edstem` 0.5.0**（`/opt/homebrew/bin/edstem`）。`source env.sh` 之后不会用到它。想彻底清掉：`npm uninstall -g edstem-cli`。

> `MOODLE_BASE_URL` / `ONTRACK_BASE_URL` 已写入各自的配置文件，**日常不需要再 export**；
> `env.sh` 里那行 `MOODLE_BASE_URL` 只是兜底。

---

## 三、接入状态（2026-10-26 实测）

### 三通道

| 通道 | 状态 | 凭据 / 配置 | 验证命令与结果 |
|---|---|---|---|
| Moodle | ✅ 可读 | CDP 从 Chrome 捕获会话；`~/.config/moodle-cli/config.yaml` | `moodle user --json` → [redacted local user id] · `units` → 10 门 |
| Ed | ✅ 可读可写 | `~/.config/edstem-cli/token` | `edstem user --json` → [redacted local account]，3 门 active |
| OnTrack | ✅ 可读 | `~/.config/ontrack-cli/config.yaml` | `ontrack units --json` → FIT1045，用户 [redacted local user id] |

**站点信息**：`https://learning.monash.edu`，theme `monash`，时区 `Asia/Kuala_Lumpur`。
`moodle coverage` 结果：**ok 17 / skip 1 / untested 1**；校方禁用 5 个 web service
（`core_course_get_contents`、`core_course_get_course_module`、`core_enrol_get_users_courses`、
`core_webservice_get_site_info`、`mod_forum_get_forums_by_courses`），CLI 有降级路径，不影响读。

> OnTrack 不是 `ontrack.monash.edu`（该域名在本机 DNS 无解析），实际是
> `https://ontrack.infotech.monash.edu`，走 Okta SAML。

### MCP：两个宿主分别注册

MCP 不是全局注册制，**每个宿主读自己的配置**。

| 宿主 | 位置 | 内容 | 生效条件 |
|---|---|---|---|
| Codex | `~/.codex/config.toml` | `[mcp_servers.edstem]` → `stack/tools/node_modules/.bin/edstem-mcp` | 重启 Codex |
| DSH | `~/.dsh/profiles/web/cordis.patch.yml` | `- insert:` 一条 `@deepseek-ai/dsh-mcp-client`，`serverName: edstem`，`transport: stdio` | **重启 App**（不热加载） |

- Ed MCP 暴露 **27 个工具**，命名 `mcp__edstem__<tool>`（`list_courses` / `list_threads` / `read_thread` /
  `search_threads` / `show_forum_catchup` / `submit_slide` 等）。
- `failOnStartupError: false`：连接失败时 harness 照常启动，只是没有这些工具。
- `moodle mcp`（Cloudflare 部署）**未做**，当前 Moodle 走 CLI 即可。

### Skill

`monash-moodle`（查询工作流，不含客户端与凭据）：

- 定义在 hub：`~/Documents/Codex/Codex-skills-hub/active/agents/monash-moodle/`
- 软链到 `~/.agents/skills/monash-moodle` 与 `~/.codex/skills/monash-moodle`
- `quick_validate.py` 通过；会话技能目录可直接发现，无需重启

### 会话续期

Moodle 会话 4 小时过期，已装 LaunchAgent：

| 项 | 值 |
|---|---|
| label | `com.moodle-cli.keepalive` |
| 间隔 | 120 分钟（`StartInterval: 7200`，`RunAtLoad`） |
| plist | `~/Library/LaunchAgents/com.moodle-cli.keepalive.plist` |
| 日志 | `~/.cache/moodle-cli/keepalive.log` |
| 撤销 | `moodle auth keepalive uninstall` |

> **坑**：plist 不继承 `MOODLE_BASE_URL`。必须在 `~/.config/moodle-cli/config.yaml` 写死
> `base_url`，否则后台续期直接报 `No base_url configured`（已修）。

---

## 四、三个 CLI 共享的接口契约

这一节是以后写代码时要遵守的东西，不是说明书。

### 输出

| 场景 | 行为 |
|---|---|
| 终端（TTY） | 人读的表格 |
| 管道 / 重定向 | 自动 JSON |
| 强制 | `--json` / `--yaml` / `--table` |
| 裁剪 | `--fields <fields>` |
| 落盘 | `-o, --output <file>` |

### 变更类命令（提交作业、发帖）

```
打印计划 → --dry-run 停在这里 → 管道里没有 --yes 就拒绝执行
```

这是安全设计，不要绕过它。

### 退出码

| 码 | 含义 |
|---|---|
| 2 | 用法错误 |
| 3 | 认证失败 |
| 4 | 未找到 |
| 5 | 站点返回错误 |

脚本和 agent 一律**按数字分支，不要匹配文字**。

### 机器可读的命令树

```bash
moodle commands --json    # 58 KB，完整命令树含每个参数
edstem commands --json    # 18 KB
ontrack commands --json   # 14 KB
```

**这是扩展的第一入口**：想知道某个命令的参数和是否 mutating，查这个 JSON，不要猜、不要爬 `--help`。

### 其它扩展入口

| 命令 | 用途 |
|---|---|
| `moodle mcp` | 在你自己的 Cloudflare 上起私有 MCP server |
| `moodle coverage` | **检查这个 Moodle 站点支持哪些命令** ← 马来西亚校区先跑这个 |
| `edstem skills` / `ontrack skills` | 生成对应的 agent skill |
| `moodle doctor` | 诊断运行时、会话、MCP |

---

## 五、Cove 的仓库与发布边界

当前工作区把产品文档和可部署实现分成两个 Git 边界：

| 层 | 位置 / 远端 | 责任 | 发布方式 |
|---|---|---|---|
| 产品文档与路线 | `/Users/Admin/Desktop/Monash Agent` | PRD、价值回放、路线、工具接入事实 | 不承载 Cove Worker 代码；`stack/` 被整体忽略 |
| Cove 实现 | `/Users/Admin/Desktop/Monash Agent/stack/unicorn`，独立仓库 `https://github.com/TuuHub/unicorn.git` | Worker、D1 migrations、MCP door、连接器、安装器和测试 | 以该仓库的已验证 commit 为候选，部署到操作者自己的 Cloudflare 账户 |

产品名是 **Cove**；`unicorn` 仍是当前 Git 仓库、npm package、Worker、D1
数据库和部分 URL 的兼容性标识。它们不能在没有迁移计划的情况下单独改名。
因此，修改实现时应在内层仓库提交和发布；修改产品定义或路线时应在父文档仓库记录。
`npm run setup` 是用户自部署流程，不等于发布一个由维护方统一托管的服务。

## 六、Cove 的扩展契约

### 加一个新数据源 = 实现两个方法

`stack/unicorn/src/plugins/plugin.ts`：

```ts
export interface Plugin {
  readonly id: string;
  pull(): Promise<ItemInput[]>;
}
```

就这么多。现有的 Moodle / Ed / Canvas / Gmail 插件都是这个形状。**我们要加"规则源"或"课表源"，也只是写一个 `pull()`。**

### Gmail 走哪条路：REST 还是 MCP（2026-10-26 实测）

unicorn 上游自带的 Gmail preset 走 `gmailmcp.googleapis.com/mcp/v1`，但该端点**只对 Google Workspace Developer Preview Program 成员开放**，非成员调用工具时返回：

```
Access to this tool requires that your Google Cloud project (...) is enrolled
in the Google Workspace Developer Preview Program.
```

同一个 `gmail.readonly` token 走正式版 `gmail.googleapis.com/gmail/v1` 完全正常。所以我们加了本地适配器，两条路并存：

| | 上游 MCP presets | 我们的 REST 适配器 |
|---|---|---|
| 文件 | `src/plugins/presets/gmail.json` | `src/plugins/campus/gmail-plugin.ts` |
| 入口 | `gmailmcp.googleapis.com/mcp/v1`（预览） | `gmail.googleapis.com/gmail/v1`（正式） |
| 取信方式 | `search_threads` 工具 | `messages.list` + **batch** `messages.get` |
| 子请求/轮 | 视 MCP 服务端而定 | 最多 3 list + 3 batch = 6（+1 次 token 刷新） |
| 选择逻辑 | `manifest.id !== "gmail"` 或非 OAuth 时 | `manifest.id === "gmail"` 且 transport auth 为 oauth（`src/runtime/cycle.ts`） |

要点：

- **批量拿元数据**：Gmail 一次 batch 最多 100 个子请求，所以 100 封元数据只花 1 次 subrequest；这是从「1 封 1 次」改成批量的原因，否则 Workers 免费版 50 次上限直接爆。
- **键是 message id**，不是 thread id —— 幂等（同一封邮件重复同步不会新增条目）。实测连续三轮同步：79 → 108 → 110，`COUNT(*) == COUNT(DISTINCT item_id)`。
- **上限**：`MAX_RESULTS=100 × MAX_PAGES=3 = 300` 封/轮，窗口 14 天。实测 14 天匹配 201 封，够用；超过 300 时按最新优先截断。
- **RFC 2047 解码**：`=?UTF-8?B?...?=` 这类编码标题会解码后再入库，否则标题是乱码。
- **403 二义性**：Gmail 对「权限不足」和「超配额」都返回 403，目前统一当 auth 失败处理（会显示"重连 Gmail"），遇到真的限流会误导一次。

### 一个 Item 长什么样

`src/kernel/types.ts`：

```ts
interface ItemInput {
  id: string;
  source: string;      // "campus-moodle" | "campus-ed" | ...
  kind: string;        // deadline / grade / notice / ...
  title: string;
  timestamp: string;
  url?: string;
  body?: string;
  raw: JsonValue;      // 原始数据，便于回溯
  facets: Facet[];
}
```

### 它能识别哪些"变化"

```
item.added  item.archived  item.restored  deadline.changed
state.changed  grade.changed  content.changed  notice.posted
```

**注意这里没有 `policy.changed`。** 政策变了不属于这八种 —— 这是它结构性看不到的东西。

### 14 个 MCP 工具

| 工具 | 干什么 |
|---|---|
| `get_briefs` / `ack_briefs` / `write_brief` | 简报收件箱（读 / 标记已读 / 写入，写入带幂等键） |
| `changes_since` | 自某个游标以来的类型化变更 ← **核心** |
| `course` / `life` | 按课程 / 按非课程视角汇总 |
| `search_items` / `upcoming` | 检索 / N 天内到期 |
| `get_plan` / `save_plan` | 跨设备计划的读写 |
| `remember` | 存偏好与纠正 |
| `label_items` | 给条目打标 |
| `status` | 部署与同步健康状态 |
| `run_playbook` | 跑 weekly-plan / decompose-assignment / forum-brief / triage |

它自己的定位声明（会出现在每次对话里）:

> *"unicorn is a memory layer … It does not reason about them — you do."*

---

## 七、`refs/` 里读什么

三个都**不装、不进产品**，只读。

| 目录 | 许可 | 读什么 |
|---|---|---|
| `refs/Muster/` | ⚠️ PolyForm Noncommercial | 最完整的 Monash Moodle 桌面端：数据模型、页面组织、资源分类 |
| `refs/jiujiastudy/` | ⚠️ PolyForm Noncommercial | **最接近我们要做的东西**：本周清单怎么排、状态（正常/落后/过载）怎么判定、建议怎么生成 |
| `refs/monash-moodle-skill/` | MIT | 唯一带 Monash 本地知识的：时区处理、考勤规定、考试要求的多源核对 |

**许可证红线**：前两个是 Noncommercial，可以读、可以自己用，**不能把代码抄进任何对外分发的产品**。

---

## 八、已知问题

| 问题 | 状态 |
|---|---|
| `~/.npm` 缓存被沙箱拦 | 已改用 `stack/.npm-cache` |
| 全局 `edstem` 是旧版 0.5.0 | 用 `source env.sh` 规避；Codex/DSH 的 MCP 直接指向 0.8.2 的绝对路径，不经过全局 |
| `workerd` / `esbuild` 的 postinstall 被 npm 拦 | 暂时无影响；`wrangler dev/deploy` 报错时再批准 |
| Moodle 马来西亚校区域名 | ✅ 已确认 `https://learning.monash.edu`，`coverage` 17 项通过 |
| keepalive 依赖 Chrome 的 CDP 会话 | Chrome 完全退出且会话过期时需人工重登一次 |
| edstem MCP 指向仓库内绝对路径 | 仓库移动或 `node_modules` 被清理即失效；长期方案是全局装 0.8.2 |
| DSH 的 MCP 改动不热加载 | 改 `cordis.patch.yml` 后必须重启 App |

---

## 九、下一步

1. **重启 DeepSeek Harness**，确认 `mcp__edstem__*` 工具出现；失败则回滚
   `~/.dsh/profiles/web/cordis.patch.yml`（备份 `cordis.patch.yml.bak-20261026-135653`）。
2. 决定是否把 `edstem-cli@0.8.2` 全局安装，替掉 0.5.0，消除 MCP 的路径依赖。
3. **unicorn 已部署**（2026-10-26）到 https://unicorn.example.workers.dev，D1 `[redacted D1 id]`，
   调度器已启动、每小时一轮。凭据在 `~/.config/unicorn/tokens.env`（600）。
4. 待办：Moodle 会话 4 小时过期，unicorn 不会自动续；需要一个本地 LaunchAgent 定时
   `sweet-cookie` 抓 `MoodleSession` 再推回去，否则每轮同步都会 `session_expired`。
5. 待办：把 `https://unicorn.example.workers.dev/mcp` 注册成 Codex/DSH 的 MCP（bearer `MCP_TOKEN`），
   否则这些数据 agent 还看不到。
6. 待办：Workspace Developer Preview 申请（表单已填，等 Google 审批，几天）；批下来后可切回 MCP 路径。
