# Moodle 作业 / 资料下载检查（2026-10-30）

## 结论

**资料下载已实现；作业提交文件下载仍未实现。**

- `mod/resource` 页面可以通过本地服务代理下载到本机；
- 下载前会校验 URL 属于当前 Moodle origin，只允许 `/mod/resource/view.php`；
- 文件大小上限 50 MB；
- 不下载作业提交文件、不自动提交作业。

现有的 Moodle 适配器只做两件事：

- `core_course_get_enrolled_courses_by_timeline_classification`
- `core_calendar_get_action_events_by_timesort`

它没有请求 `pluginfile.php`，没有保存附件元数据，也没有下载文件的 API 或 UI。

## 实测

- 用真实 `MoodleSession` 打开一个 `mod/assign/view.php` 页面，HTTP 200；
- 页面中出现的 `pluginfile.php` 只有主题 banner，没有作业附件；
- 当前课程页面在静态 DOM 中没有 `mod/resource`、`mod/folder` 或 `mod/assign` 链接；
- `core_course_get_contents` 返回 `servicenotavailable`，当前站点没有开放这个 Web Service；
- 因此无法用现有 AJAX 方式稳定列出课程资料。

## 目前能做什么

- 每周资料页列出资料、作业/考核、公告/讨论和说明；
- `resource` 行有“下载”按钮，由本地服务用 Moodle session 代理文件；
- 支持单选、全选当前筛选资料、批量 ZIP 下载；
- 在简报详情里点“打开原始来源”，打开 Moodle 原始页面；
- 不下载作业提交文件、不自动提交作业。

## 边界

1. 当前只代理 `mod/resource` 单文件；folder/zip 列表仍打开原始页面；
2. 作业提交文件不在范围内，避免误下载或代表用户操作；
3. 下载文件不自动入库，只按点击返回；
4. 会话过期时下载会失败，需要重新连接 Moodle。
