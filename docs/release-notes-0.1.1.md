# Cove 0.1.1

本版本集中完善签到和简报详情。

## 新增

- 简报详情显示完整原文、作者姓名和作者角色；
- Ed thread 实时读取老师/学生回复，区分 staff / student；
- 详情增加“查看原文”链接；
- Gmail 详情使用完整邮件正文和发件人；
- Attendance 签到页：自动识别用户班次；
- 签到班次手动调整；
- 按用户班次过滤 attendance code；
- Gmail + Moodle attendance code 汇总；
- Moodle label/forum 图片使用内置 Tesseract.js / WASM OCR；
- 一键填写单个 attendance；
- 一键填写当周所有 attendance；
- 首次设置门控修复：同步期间切换页面不再强制跳转。

## 安装

见 [安装说明](https://github.com/jackdsjk/Monash-Agent/blob/main/docs/desktop-install.md)。

## 已知限制

- macOS Launcher 仍未 Apple Developer ID 签名；
- 公开发布包不包含 Google OAuth client secret；
- 没有 active attendance code 窗口时，一键填写只返回 `inactive`，不会自动提交；
- 当前详情实时回复主要覆盖 Ed；Moodle forum 仍需后续增强；
- Windows 包未在真实 Windows 机器验证。
