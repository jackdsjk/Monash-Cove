# GitHub 展示改版与验证（2026-11-11）

## 已完成

- 重排中英文 README：品牌图、真实 UI 截图、快速开始、功能、来源边界、架构与开发入口。
- 通过 PinAI `gpt-image-2` 生成品牌背景，再用 Pillow 独立排版。横幅 1600×720；分享图 1280×640、731,458 字节。原图、提示词和重建方法见 [素材说明](assets/README.md)。
- 使用固定匿名 DTO 拍摄简报、成绩、Ed、OnTrack 四个生产 UI 页面，均为 1440×1080。演示课程、成绩和反馈均为虚构数据；没有读取真实账号。连续两次重拍 SHA256 相同。
- 已更新 `jackdsjk/Monash-Cove` 的 GitHub About 和 Topics，并通过已登录浏览器上传分享图。GraphQL 返回 `usesCustomOpenGraphImage: true`，远端图片与本地 `cove-social.png` 字节完全一致。
- 已补充根 AGENTS 的素材维护、隔离截图与禁止真实账号截图规则。

About 当前为：

> A local-first workspace for Monash coursework: changes, deadlines, grades and learning materials across Moodle, Ed, OnTrack and Gmail.

Topics：`monash`、`moodle`、`edstem`、`ontrack`、`local-first`、`student-tools`、`react`、`typescript`、`fastify`、`sqlite`、`model-context-protocol`。

## 内容核对与参考取舍

参考 [GitHub CLI](https://github.com/cli/cli) 将真实截图和安装入口提前的做法，以及 [Unicorn](https://github.com/TuuHub/unicorn) 简洁的品牌入口。没有复制参考仓库的图片、文案或实现代码；保留本项目的本地 Web App / 独立 memory layer 边界。

README 明确说明可选远端模型接收的字段、外部 MCP 客户端的数据访问、macOS Keychain 与其他平台文件存储、考勤的单独提交入口，以及启动脚本只构建缺失 dist 的行为。没有新增整体软件许可证，也没有将 Windows、签名发布或全部课程的真实数据覆盖描述为已验证。

## 验证

- 两端 `npm run check` 通过：后端 453 项测试、TypeScript 与构建；前端数据检查、TypeScript 与 Vite 构建。
- 前端 `npm exec vitest run`：164 项通过。
- `npm run e2e` 隔离浏览器回归通过。
- 四截图生成脚本执行、网络隔离断言和语法检查通过；品牌图重建通过。
- GitHub Markdown API 成功渲染两个 README；本地预览使用近似 GitHub CSS，在 1280px 和 390px 检查，图片全部加载，无整页横向溢出；检查了浅色和深色显示。该预览不等同于已推送后的 GitHub 仓库页面，Mermaid 的最终显示仍由 GitHub 处理。
- 相对链接、三个 details 折叠区和 `git diff --check` 通过。

前端构建保留既有的单块超过 500 kB 提示；本轮没有修改运行时代码或依赖。

## 发布与维护边界

About、Topics、social preview 已直接生效。README、截图、生成脚本及文档均本地提交，本轮未 push。临时 HTML 和预览截图位于忽略的 `build/audit/github-showcase/`，不进入 Git。

后续 UI 变更时运行 [截图脚本](../webapp/e2e/capture-readme.mjs) 并审查图片；品牌文字变更时运行 [排版脚本](../scripts/build-github-art.py)。重新截图不得访问真实账号。macOS 文件选择器的“前往”可能只高亮文件而未激活“打开”；重新用方向键选择文件后核对按钮状态，避免把高亮当作已上传。
