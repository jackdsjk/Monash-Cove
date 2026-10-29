# Moodle 作业 / 资料下载检查（2026-10-30）

## 结论

当前 **没有实现** Moodle 作业下载或资料下载功能，因此不是“功能异常”，而是功能不存在。

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

- 在简报详情里点“打开原始来源”，打开 Moodle 原始页面；
- 用户在 Moodle 页面自行下载资料或查看作业；
- 不在应用内下载、保存或提交作业。

## 如果要做下载

需要单独设计：

1. 通过真实浏览器会话或可用的 Moodle 页面解析列出 `pluginfile.php` 资源；
2. 下载到本机受控目录，记录文件名、来源、大小和哈希；
3. 不自动提交作业、不自动代表用户上传文件；
4. 会话过期时明确提示重新登录。

在完成前，不应把“资料下载”描述成已支持。
