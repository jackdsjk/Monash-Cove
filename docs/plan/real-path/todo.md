# 执行队列：Cove 真实数据

> 只按顺序执行；完成一个阶段后回到 [next.md](next.md)。这里不写人的周计划。

## S1 本地运行时 + fixture API

- [x] 建 `local-service/`：Node 26 + TypeScript + Fastify，`GET /health`
- [x] 写 API contract v1
- [x] 复制 55 条 fixture 到 `local-service/fixtures/`
- [x] 实现 `/api/sources`、`/api/brief`、`/api/items/:id`
- [x] 统一错误结构
- [x] Vite proxy `/api` → `127.0.0.1:4317`
- [x] `webapp` 数据层改为 fetch
- [x] API 合约测试
- [x] 跑 S1 验证并更新 `next.md`

## S2 SQLite + 持久状态

- [x] `node:sqlite` 建库和路径
- [x] 建表与索引
- [x] migration runner
- [x] fixture seed
- [x] `/api/check`
- [x] `/api/items/:id/correction`
- [x] `DELETE /api/data`
- [x] Web App 状态改 API
- [x] 重启持久测试
- [x] `.gitignore` 数据库文件
- [x] 跑 S2 验证并更新 `next.md`

## S3 Gmail 纵向切片

- [x] `SecretStore`（macOS Keychain）
- [x] credentials 文档
- [x] Gmail OAuth loopback + refresh
- [x] Gmail list/get/MIME
- [x] 首次 backfill 20 封
- [x] history cursor + 回退
- [x] 规范化字段
- [x] 规则分诊移植
- [x] 证据校验
- [x] `/api/sync`（Gmail）
- [x] 来源页真实状态
- [x] 详情真实 URL
- [x] mock Gmail 测试
- [ ] 真实 Gmail（凭据缺失则 blocked）
- [x] 跑 S3 验证并更新 `next.md`

## S4 Ed + Moodle 最小切片

- [x] Ed token/region
- [x] Ed 最新 30 主题
- [x] Ed 规范化 + 增量
- [x] Moodle session 录入/Keychain
- [x] Moodle courses/assessments
- [x] 同步编排器
- [x] 60 分钟调度 + 失败退避
- [x] 课程归属/未归属
- [x] 时间戳/URL
- [x] 精确去重
- [x] 三源来源状态
- [x] 失败注入
- [x] 三源 mock E2E
- [x] 跑 S4 验证并更新 `next.md`

## S5 Moodle 论坛帖子

- [x] 探测论坛 URL/分页/帖子 URL
- [x] forum list
- [x] thread/post detail
- [x] post 规范化
- [x] 增量/编辑/软删除
- [x] session 过期
- [x] 限流与重试
- [x] HTML fixture 测试
- [x] Web App 帖子显示
- [ ] 真实账号 smoke（凭据缺失则 blocked）
- [x] 跑 S5 验证并更新 `next.md`

## S6 规则/模型分诊

- [x] 规则模块共享
- [x] 规则覆盖边界
- [x] 模型适配 + 回退
- [x] 输出 schema
- [x] 证据校验
- [x] critical 护栏
- [x] 版本字段
- [x] 55 条回归
- [ ] 10 条真实 holdout
- [x] UI 待确认/低置信
- [x] 关模型可用
- [x] 跑 S6 验证并更新 `next.md`

## S7 可靠性、安全、交付

- [x] loopback/Origin/CSRF/CSP
- [x] 日志脱敏
- [x] 数据删除与 Keychain 清除
- [x] 失败注入
- [x] Playwright happy path
- [x] Playwright 失败/清除
- [x] 生产同源服务
- [x] 启动器
- [x] 运行手册
- [x] 发布检查表
- [x] 跑 S7 验证并更新 `next.md`

## S8 真实账号验证

- [x] Gmail 真实同步 + 原文
- [x] Ed 真实同步（91 条）
- [x] Moodle courses/assessments 真实同步（6 条）
- [x] Moodle 论坛真实同步（当前课程无论坛链接，返回 0）
- [x] 真实简报/证据/链接（117 条）
- [x] 重启持久（三源仍 connected）
- [x] 清除路径（API/E2E 测试覆盖；未清真实凭据）
- [x] 记录并修复真实环境问题
- [x] 更新 `next.md` 为 done
