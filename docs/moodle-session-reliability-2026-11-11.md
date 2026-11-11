# Moodle 会话可靠性修复

本轮处理登录态过早失效及错误过期提示，代码提交 `64341df`。验证使用匿名 fixture、内存 SecretStore 与临时数据库；未读取真实浏览器 Cookie、访问学校账号或执行外部写入。

## 根因与处理

| 已确认的实现缺口 | 当前处理 |
|---|---|
| 登录后只使用静态 Cookie header，后续 Set-Cookie 丢失 | 每连接共享 CookieJar，消费站内跳转中的 Cookie 轮换，保存到原 SecretStore，重启恢复 |
| 登录浏览器 UA 与后端固定 UA 不同 | 捕获 navigator.userAgent，后端和截图沿用；旧凭据仍兼容 |
| 每 6 小时检查一次，页面命中缓存后可能长期不访问 Moodle | 生产入口启动时及每 10 分钟维护 `/my/`，独立于批量同步，并合并并发探测 |
| setup/status 将离线或 503 当作登录失效 | 区分有效、明确过期、不可达；离线/429/5xx/未知响应不覆盖最后成功状态或时间 |
| Cookie 字符串改变会改变缓存与课程偏好指纹 | 内部续期保留连接标识；显式登录生成新标识，并使旧读请求失效 |
| 截图通过全局 header 注入 Cookie，OCR 绕过维护传输 | 浏览器按 domain/path/expiry 注入；OCR 页面与图片统一使用注入的传输层 |

这些代码缺口足以解释“丢掉轮换”及“误报过期”的风险；没有实际学校请求日志，因此不能断言每一次真实失效都来自同一个根因。

## 参考版本与取舍

本轮直接核对用户提供的 `/Users/Admin/Documents/Workspace/muster`，固定提交 **`ad2372683e0fbc4efb148af8b81840ae8dee5f39`**；并非 `refs/Muster` 旧副本。该版本使用 **PolyForm Noncommercial 1.0.0**，NOTICE 为 Copyright 2026 Poetrynan。本轮未复制 Rust 代码。

| 来源 | 采用 | 未采用及原因 |
|---|---|---|
| Muster `src-tauri/src/moodle/auth.rs` 的 `create_client_with_session`、SessionData；`src-tauri/src/moodle/http.rs` | Cookie provider、保存实际 UA、带范围的 Cookie、区分网络故障与登录失效 | 不搬入 Tauri/Rust 运行时；没有把参考实现描述为永久续期，也没有将本地十分钟间隔归因于 Muster |
| [fetch-cookie](https://github.com/valeriangalliat/fetch-cookie)，3.2.0、MIT | 包装现有注入 fetch，按响应接收 Cookie，处理站内重定向 | 不自行实现 Set-Cookie/重定向协议；外部 IdP 跳转在发送请求前停止，交回显式登录 |
| [tough-cookie](https://github.com/salesforce/tough-cookie)，6.1.0、BSD-3-Clause | Cookie 的 domain/path/secure/expiry 匹配及序列化 | 不把 Cookie jar 放浏览器 localStorage 或 SQLite 快照；沿用原 SecretStore |

十分钟为本地维护策略，用于减少闲置到期；它不是学校公布的会话有效期，也不保证任何 Moodle 部署都会因读取而续期。依赖通过现有 Node fetch 接口接入，保持外部服务可 mock、可替换。

## 生命周期与数据边界

- [moodle-transport.ts](../local-service/src/moodle-transport.ts) 为当前连接维护一个 jar；普通维护请求未改变 Cookie 时不重复写 Keychain。内部轮换绕过显式重连的缓存失效逻辑。
- 旧凭据首次迁移仍用原 `sha256("moodle\0" + raw)` 标识，保存为 `connectionId`；后续轮换不重置快照和课程范围。主动重新登录，即使是同账号，也使用新标识。
- 轮换、重连、断开的持久化写入共用队列；代次与 AbortSignal 阻止旧请求回写。登录取消发生在持久化过程中时，先回退该写入，再执行之后排队的新登录。
- [moodle-session.ts](../local-service/src/moodle-session.ts) 合并启动、状态页与定时检查。明确登录页、401、外部 SSO 才标记过期；不删除有效但临时不可达的凭据。坏 JSON、缺字段或空 Cookie 仍按损坏凭据处理。
- [moodle-browser-session.ts](../local-service/src/moodle-browser-session.ts) 将当前 jar 投影为浏览器 scoped cookies，保留实际 UA；截图不再把 Cookie header 附加到所有请求。截图和 OCR 拒绝将登录页作为课程内容。
- 维护只在本地服务运行时发生；进程停止、电脑休眠、学校撤销、绝对超时或 MFA 均可能要求重新登录。建议更新后重新连接一次 Moodle，以捕获完整 Cookie 元数据及真实 UA；无需手动复制 Cookie。

## 验证

在本轮代码提交前执行：

| 位置 | 命令 | 结果 |
|---|---|---|
| `local-service` | `rtk npm run check` | 31 个测试文件、277 项通过；TypeScript 构建通过 |
| `webapp` | `rtk npm run check` | 数据检查、类型检查及生产构建通过 |
| `webapp` | `rtk npm exec vitest run` | 14 个文件、87 项通过 |
| `webapp` | `rtk npm run e2e` | 独立随机端口服务与隔离浏览器 smoke 通过 |
| 仓库根 | `rtk git diff --check` | 通过 |

新增 63 项后端回归涵盖 Cookie 轮换与重启恢复、范围约束、站内续期后课程 AJAX、外部 SSO 阻断、真实 UA 沿用、登录取消、换账号/断开竞态、离线与 503 状态保持、截图和 OCR 旁路。维护模拟使用 30 分钟 idle lease：只有每 10 分钟一次维护请求，40 分钟后仍有效；这是测试模型，不是实际 Monash 会话测量。

所有相关 fixture 测试隔离 `ONTRACK_CONFIG_DIR` 与网络，不启动真实学校登录。浏览器 smoke 覆盖断开来源的首次运行及示例模式，不能代替实际学校会话的长时间观察。前端构建仍有既有的大于 500 kB chunk 提示，本轮未改动前端打包。
