# Monash Cove 0.1.2

本版本新增 Ed 学习内容，修复 Moodle 校区资料混用，并改进倒计时界面。

## 新增

- **Ed 学习页**：按课程和 Lesson 浏览视频、文字、附件；
  - 视频直接跳转；
  - 文字可打开 Ed 页面或下载 Markdown；
  - PPT / PDF / 附件直接下载；
  - 整个 Lesson 可打包为 ZIP。
- **Moodle 校区过滤**：区分马来西亚 / 澳大利亚 / 印尼资料；
- 抓取 `[Malaysia Campus] Resources` 标签内的真实文件；
- 无法直接提取的 Moodle label/page 支持下载页面布局 PNG；
- 倒计时改为方块网格，最大卡片显示最优先截止项。

## 修复

- FIT1047 马来西亚学生看到澳大利亚 Applied Session 资料的问题；
- Ed / Gmail 详情中的完整原文、作者和老师/学生回复；
- 签到班次识别、Moodle 图片 OCR、单个/当周批量填写。

## 已知限制

- macOS Launcher 仍未 Apple Developer ID 签名；
- 公开发布包不包含 Google OAuth client secret；
- 没有 active attendance code 窗口时只返回 `inactive`，不会自动提交；
- Windows 包尚未在真实 Windows 机器验证；
- 尚无应用内自动更新。

完整安装与新用户说明：[docs/getting-started.md](getting-started.md)。
