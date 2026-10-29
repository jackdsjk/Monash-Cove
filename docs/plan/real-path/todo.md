# 执行队列：Cove 真实数据

> 只按顺序执行；完成一个阶段后回到 [next.md](next.md)。这里不写人的周计划。

## S1 本地运行时 + fixture API

- [ ] 建 `local-service/`：Node 26 + TypeScript + Fastify，`GET /health`
- [ ] 写 API contract v1
- [ ] 复制 55 条 fixture 到 `local-service/fixtures/`
- [ ] 实现 `/api/sources`、`/api/brief`、`/api/items/:id`
- [ ] 统一错误结构
- [ ] Vite proxy `/api` → `127.0.0.1:4317`
- [ ] `webapp` 数据层改为 fetch
- [ ] API 合约测试
- [ ] 跑 S1 验证并更新 `next.md`

## S2 SQLite + 持久状态

- [ ] `node:sqlite` 建库和路径
- [ ] 建表与索引
- [ ] migration runner
- [ ] fixture seed
- [ ] `/api/check`
- [ ] `/api/items/:id/correction`
- [ ] `DELETE /api/data`
- [ ] Web App 状态改 API
- [ ] 重启持久测试
- [ ] `.gitignore` 数据库文件
- [ ] 跑 S2 验证并更新 `next.md`

## S3 Gmail 纵向切片

- [ ] `SecretStore`（macOS Keychain）
- [ ] credentials 文档
- [ ] Gmail OAuth loopback + refresh
- [ ] Gmail list/get/MIME
- [ ] 首次 backfill 20 封
- [ ] history cursor + 回退
- [ ] 规范化字段
- [ ] 规则分诊移植
- [ ] 证据校验
- [ ] `/api/sync`（Gmail）
- [ ] 来源页真实状态
- [ ] 详情真实 URL
- [ ] mock Gmail 测试
- [ ] 真实 Gmail（凭据缺失则 blocked）
- [ ] 跑 S3 验证并更新 `next.md`

## S4 Ed + Moodle 最小切片

- [ ] Ed token/region
- [ ] Ed 最新 30 主题
- [ ] Ed 规范化 + 增量
- [ ] Moodle session 录入/Keychain
- [ ] Moodle courses/assessments
- [ ] 同步编排器
- [ ] 60 分钟调度 + 失败退避
- [ ] 课程归属/未归属
- [ ] 时间戳/URL
- [ ] 精确去重
- [ ] 三源来源状态
- [ ] 失败注入
- [ ] 三源 mock E2E
- [ ] 跑 S4 验证并更新 `next.md`

## S5 Moodle 论坛帖子

- [ ] 探测论坛 URL/分页/帖子 URL
- [ ] forum list
- [ ] thread/post detail
- [ ] post 规范化
- [ ] 增量/编辑/软删除
- [ ] session 过期
- [ ] 限流与重试
- [ ] HTML fixture 测试
- [ ] Web App 帖子显示
- [ ] 真实账号 smoke（凭据缺失则 blocked）
- [ ] 跑 S5 验证并更新 `next.md`

## S6 规则/模型分诊

- [ ] 规则模块共享
- [ ] 规则覆盖边界
- [ ] 模型适配 + 回退
- [ ] 输出 schema
- [ ] 证据校验
- [ ] critical 护栏
- [ ] 版本字段
- [ ] 55 条回归
- [ ] 10 条真实 holdout
- [ ] UI 待确认/低置信
- [ ] 关模型可用
- [ ] 跑 S6 验证并更新 `next.md`

## S7 可靠性、安全、交付

- [ ] loopback/Origin/CSRF/CSP
- [ ] 日志脱敏
- [ ] 数据删除与 Keychain 清除
- [ ] 失败注入
- [ ] Playwright happy path
- [ ] Playwright 失败/清除
- [ ] 生产同源服务
- [ ] 启动器
- [ ] 运行手册
- [ ] 发布检查表
- [ ] 跑 S7 验证并更新 `next.md`

## S8 真实账号验证

- [ ] Gmail 真实同步 + 原文
- [ ] Ed 真实同步
- [ ] Moodle courses/assessments 真实同步
- [ ] Moodle 论坛真实同步
- [ ] 真实简报/证据/链接
- [ ] 重启持久
- [ ] 清除无残留
- [ ] 记录并修复真实环境问题
- [ ] 更新 `next.md` 为 done
