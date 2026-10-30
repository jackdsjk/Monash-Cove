# Execution Log

每完成一个阶段追加一行；只记录可验证的事实。

| 时间 | 阶段 | 验证命令 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-10-29 | plan | — | 执行计划建立 | S1 ready；尚未开始实现 |
| 2026-10-30 | S1 | `cd local-service && npm test`; `cd webapp && npm run check` | 6 tests pass；webapp build pass；Vite proxy `/api/brief` 返回 55 条 | 进入 S2 |
| 2026-10-30 | S2 | `cd local-service && npm test` | 7 tests pass；SQLite schema/seed/API；重启持久测试通过；webapp corrections/read 改走 API | 进入 S3 |
| 2026-10-30 | S3 | `cd local-service && npm test`; `cd webapp && npm run check` | 10 tests pass；Gmail client/OAuth/sync mock；build pass | 真实 Gmail blocked（无凭据）；进入 S4 |
| 2026-10-30 | S4 | `cd local-service && npm test` | 17 tests pass；Ed/Moodle clients；credentials API；orchestrator；真实来源 blocked | 进入 S5 |
| 2026-10-30 | S5 | `cd local-service && npm test` | 17 tests pass；Moodle forum HTML fixture 解析；kind=forum 避免误判 assessment | 真实 Moodle session blocked；进入 S6 |
| 2026-10-30 | S6 | `cd local-service && npm test`; `npm run eval` | 20 tests pass；模型适配/证据子串/规则回退；55 条回放通过；真实 holdout blocked | 进入 S7 |
| 2026-10-30 | S7 | `cd local-service && npm test`; `cd webapp && npm run check`; `cd webapp && npm run e2e` | 21 service tests；webapp build；production E2E pass | S8 blocked：无真实凭据 |
| 2026-10-30 | S8 | — | blocked | 代码路径完成；等待用户提供 Google OAuth client、Ed token、Moodle session 和真实 holdout |
| 2026-10-30 | S8 (Gmail) | browser OAuth; `POST /api/sync`; `GET /api/sources` | Gmail 真实授权成功；backfill 20；history 0；fixture Gmail 移除；Gmail=20 | Ed/Moodle 仍 blocked |
| 2026-10-30 | S8 (all) | browser OAuth; Moodle cookie; `POST /api/sync` x3; restart | Gmail 20；Ed 91；Moodle 6；重启后三源 connected；总 117 条 | Moodle 论坛 0（当前课程无 forum 链接） |
| 2026-10-30 | S8 (UI sync) | browser click; network requests | 简报页点击“同步全部来源”发出 3 个 `POST /api/sync`，全部 200；提示“Gmail / Ed / Moodle 同步完成” | 已移除模拟同步按钮 |
| 2026-10-30 | S9 (countdown) | `npm test`; browser | Moodle `dueAt` 6 条；顶部倒计时分组；桌面/移动无横向溢出 | 作业/资料下载未实现，仅能打开原文 |
| 2026-10-30 | S9 (deadline page) | browser | 侧栏新增“倒计时”独立页面；6 个 Moodle deadline；点击卡片回到简报并打开详情 | 作业/资料下载仍未实现 |
| 2026-10-30 | S9 (materials) | browser; `POST /api/moodle/content-sync` | FIT1047 17 个板块、173 条；资料/作业/公告/说明分组；独立侧栏页 | 公告为链接，未抓正文；文件下载未实现 |
| 2026-10-30 | S9 (materials v2) | `POST /api/moodle/content-sync`; real download; API probe | 公告正文 `mod_forum_get_discussion_posts`；resource 下载返回 ZIP；每周资料页显示下载按钮 | assignment submissions 不下载 |
| 2026-10-30 | S9 (materials filter) | browser | 搜索、类型、板块筛选；资料筛选 61 条；移动端 390px 无横向溢出 | 长列表问题已缓解 |
| 2026-10-30 | S9 (batch download) | browser; `POST /api/moodle/download-batch` | 60 个可下载资料全选；批量 ZIP 实测 2 个文件 200；单选/全选/筛选后全选正常 | 单文件 50MB；批量总 100MB |
| 2026-10-30 | S9 (assignment resources) | browser; batch API | 作业筛选下显示 4 个 Specification、3 个可下载 Reflection 模板；4 个 Specification 批量 ZIP 200 | URL 模块若 Moodle 端 404 会跳过 |
| 2026-10-30 | S9 (countdown UI) | browser; 390px check | 深绿 hero + 分组行；HH:MM:SS 每秒更新；390px 无横向溢出 | 桌面/移动截图检查通过 |
| 2026-10-30 | S9 (brief filters) | browser; 390px | 类型/课程/未读/来源/搜索组合筛选；清除筛选；390px 无横向溢出 | 25 条当前视图、100 条过去内容 |
| 2026-10-30 | Full sync | `POST /api/sync/full`; status polling | Gmail 678/678；Ed 1586 threads；Moodle 10/10 courses, 535 资料；`full_sync_completed_at` 已写入；Gmail 全量按 100ms 节流避免 403 | 全量约 8–10 分钟 |
| 2026-10-30 | UI loader | browser; Playwright delayed API route | 简报/倒计时/每周资料/数据源页面使用 Cove 动态 loader；延迟 API 截图验证 | 加载结束自动切回内容 |
| 2026-10-30 | Setup wizard | clean temp service 4318; browser | 无凭据时 `/` 自动跳 `/setup`；Gmail/Ed/Moodle 连接卡；Moodle 助手 start/cancel；全量按钮 | 真实 Moodle 登录需用户手动完成 |
| 2026-10-30 | Region + naming | Malaysia/Indonesia campus labels; download headers; ZIP archive | `[Indonesia Campus]` hidden under Malaysia; individual file `FIT1047 Textbook (pdf version).pdf`; ZIP `FIT1047_S2_2026-Week-03.zip`; tests 32 | 校区判定基于课程名与 section/title 标记；未标注内容按 shared |
| 2026-10-30 | Settings layout | Settings/Sources browser | 全量同步和个人/地区移入设置；数据源页只保留来源卡；移动端无横向溢出 | 每周资料保留地区选择作为上下文筛选 |
