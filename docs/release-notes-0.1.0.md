# Cove 0.1.0

首个本地优先的 Cove 桌面测试版。

## 包含

- 本地 Fastify + SQLite 服务；
- Gmail / Ed / Moodle 只读同步；
- 首次设置向导；
- 全量与增量同步；
- Moodle 每周资料与地区筛选；
- 下载文件按资料标题命名；
- 设置页运行环境检查；
- 本地 MCP（stdio + Streamable HTTP）；
- macOS 快速启动器；
- Windows x64 包。

## 安装

见 [desktop-install.md](desktop-install.md)。

## 已知限制

- macOS Electron 包未签名；公开版提供 CoveLauncher 快速启动器；
- CoveLauncher 仍是未签名 AppleScript applet，陌生 Mac 可能需要右键打开或 Gatekeeper 允许；
- 公开 Release 不包含 Google OAuth client secret；Gmail 需要额外配置；
- Windows 包未在真实 Windows 机器验证；
- 没有真实外部用户测试完成记录；
- 当前不是版本化记忆系统；Moodle 课程资料是课程快照替换。
