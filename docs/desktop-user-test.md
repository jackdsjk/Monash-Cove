# Cove 桌面版用户测试清单

## 测试环境

- macOS：记录 macOS 版本、CPU 架构、是否安装 Chrome、是否完成签名/公证；
- Windows：记录 Windows 版本、x64/arm64、是否安装 Chrome、SmartScreen 是否出现；
- 每个测试者使用自己的 Gmail / Ed / Moodle 账号。

## 首次启动

- [ ] 解压/安装 App 后能启动；
- [ ] 首次打开自动进入 `/setup`；
- [ ] 设置页显示运行环境检查；
- [ ] Chrome 检查结果正确；
- [ ] Google OAuth 未配置时给出明确提示，而不是静默失败。

## 连接来源

- [ ] Gmail OAuth 能完成并回到 App；
- [ ] Ed token 能保存；
- [ ] Moodle 登录助手打开 Chrome；
- [ ] 用户完成 Okta/MFA 后，MoodleSession 自动捕获；
- [ ] 过期 session 会显示“未连接”，不会误报已连接。

## 同步

- [ ] 首次全量同步能启动；
- [ ] 三个来源的进度都能看到；
- [ ] 全量完成后 `fullSyncCompleted` 为 true；
- [ ] 重启 App 后连接状态仍然存在；
- [ ] 增量同步不会重复插入数据。

## 地区与资料

- [ ] 设置页可以选择马来西亚 / 澳大利亚 / 印度尼西亚；
- [ ] 马来西亚视图不显示 `[Indonesia Campus]` 内容；
- [ ] 课程列表会过滤其他校区；
- [ ] 单个下载文件名使用 Moodle 资料标题；
- [ ] 批量 ZIP 使用课程/板块名，内部文件名不是 Cove 统一命名。

## 安全

- [ ] 密码不会出现在 App 表单或日志；
- [ ] 退出后 Keychain/凭据文件仍只在本机；
- [ ] 清除本地数据后来源断开，SQLite 条目清空。

## 阻塞记录

- macOS 未签名包在 macOS 26 可能被 AMFI 拒绝；需要 Developer ID + 公证；
- Windows 未签名包会触发 SmartScreen；
- Google OAuth 需要每个安装配置 client，尚未做桌面 OAuth 配置页面；
- Windows arm64 未在真实 Windows 机器测试。
