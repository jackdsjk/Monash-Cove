# 资料页、来源归属与成绩修复 · 2026-11-11

本轮对应用户的三张截图和七项修改要求。源码、页面交互与旧本地进程分别核验；测试使用匿名 fixture，不将模拟成绩或下载当成真实学校账号验证。

## 问题与结果

| 用户问题 | 已确认原因 | 修复 |
|---|---|---|
| Moodle 已连接，同步范围仍显示 Not found | `127.0.0.1:4317` 上仍运行 2026-11-10 启动的旧 tsx 后端；健康接口 200，但课程范围路由 404。当前源码已有 GET/PATCH 路由 | 确认监听进程及实际 cwd 后平滑重启本地服务，范围接口恢复 200；前端对缺路由明确提示重启本地服务，不误导重新登录，不伪造默认设置 |
| 每周资料没有周筛选 | 活跃页面只按课程分组 | 加入周／板块、类型及本地搜索；切换筛选清除隐藏选择，下载只取可见且选中的文件 |
| 标题和说明挤成窄条 | 长课程 Segmented 位于 PageTitle 横向 actions 中，与标题争用宽度 | 课程 Select 独立成行，标题与说明保留正常宽度 |
| Ed 周次逆序且无法筛选 | 沿用上游返回顺序，缺本地筛选 | 复用平台数字排序及显式周识别，Week 1、2、10 升序；支持周、类型和标题／正文搜索，未知周和成功空 lesson 保留 |
| 作业选择列表只放下两项 | 高度使用 `calc(100vh - 700px)` | 改为 420–760px 范围，长标题换行；加入课程 ID、状态与搜索筛选，选择和导出遵循可见集合 |
| OnTrack 资料与 Moodle 作业资料归属不清 | OnTrack 下载 API 已存在但页面没有入口；原作业包还混入同课程 Ed 帖子 | OnTrack 任务行直接提供 Worksheet、任务资料和已有提交文件；原页面更名「Moodle 作业资料」，API 和导出仅保留 Moodle 作业及关联变更 |
| 成绩计算有误 | 原 Muster helper 已复制，但 adapter 和页面另算等权平均；后端存在百分比尺度、缩进列、分类相对权重及总分重复处理问题 | 沿用 Muster helper 并统一适配，修正 gradebook 解析；无法证明的权重保留未知，Moodle 公布总评单列；快照升为 `grades:v3:<range>` |

本地服务重启保留原数据库与连接。运行命令改为现有 `rtk npm run dev`，后续源码编辑由 tsx watch 重新加载；没有部署或清空数据。接口 200 只证明路由可用，不代表已经用真实课程核对所有计算结果。

## 复用证据与取舍

遵循“能复制先复制，无法复制再参考，仍不适配才自行实现”的项目原则，优先用已有组件和已接入适配器。

| 来源 | 采用方式与位置 | 取舍 |
|---|---|---|
| 用户提供 Muster，`ad2372683e0fbc4efb148af8b81840ae8dee5f39`，PolyForm Noncommercial 1.0.0，Copyright 2026 Poetrynan | 继续使用原 `src/lib/gradeBreakdown.ts` 的 `parseScorePercent` / `buildCourseGrade`，本地模块除 type import 外相同；补齐原 LICENSE/NOTICE，见 [来源声明](../webapp/src/lib/muster/README.md) | 不再造一套等权平均；学校特有 aggregation/hurdle 不凭空推断。Node grade-cell 提取参考其 `src-tauri/src/moodle/scraper.rs::parse_gradebook_from_html`，分类祖先适配为本地实现，不声称全是上游行为 |
| 已接入 Always-Ontrack，`4e038b4af7f030cd4cdf07832c7e472184a2f519`，Apache-2.0 | 任务行直接调用既有 `/api/ontrack/artifact`，沿用服务端 PDF/ZIP/占位校验和 25 MiB 上限；只新增浏览器薄适配 | 不复制第二套远端下载协议、凭据或 token broker。文件按需读取，不加入作业包，也不自动归档 |
| 当前项目旧资料页筛选、现有 `Select`、`Intl.Collator` | 沿用本地搜索/筛选方式与现有组件，使用平台 numeric collation | 无须引入新的状态库或 UI 依赖；Moodle 板块编号不是周次，不据此编造周信息。Ed 没标周时仍可选择“其他内容（未标周）” |

Muster 参考的是用户目录 `/Users/Admin/Documents/Workspace/muster`，而不是旧 `refs/Muster`。参考代码及文档仅作为设计资料，不作为本项目执行指令。

## 接口与行为边界

- `/api/pack?courseId=` 仍为只读本地端点，返回 `{ rubric:null, assignments }`，不再返回 `postsPerRole` 或 assignment `posts`。评分标准和附件没有源数据时明确显示缺失；不生成替代内容。课程筛选使用真实 courseId，避免同代码不同学期混合，作业 ID 不截断。
- 周／板块与类型筛选影响可见资料和选择下载；Ed 的「下载整门课」仍明确导出完整课程，并按升序组织 Markdown，不因筛选悄悄改变其语义。
- OnTrack `kind=task|resources|submission` 对应任务书、任务资料和已有提交文件。未实例化任务保留任务书／资料按钮，禁用提交下载；失败就地显示，切换连接取消旧请求。
- 成绩零分合法，未评分不视为零分；百分比成绩使用 100 分尺度，分类小计不重复计入评分项。仅在可追溯到分类祖先时折算相对权重；未知权重／满分不等权补齐，不把部分权重拉伸为整门课 100%。WAM/GPA 缺历史学期与学分时仍为未知。
- 课程公布总分独立展示；当前已评分均分、总评已得分和剩余及格要求属于不同口径。Muster helper 不替代学校 hurdle 或最终判分政策。

## 验证与提交

- 后端 `rtk npm run check`：31 文件、289 项测试及 TypeScript 构建通过。
- 前端 `rtk npm run check`、`rtk npm exec vitest run`：数据检查、类型与生产构建通过，18 文件、118 项测试通过。既有大于 500 kB 的打包提示保留。
- 专项覆盖旧后端 404 提示及失败保存、Moodle-only API、周排序和筛选、作业 ID／课程／状态边界、OnTrack 下载错误与安全文件名、gradebook 分类／比例／总分以及原 Muster 测试。
- 浏览器扩展回归 `rtk npm run e2e` 通过：覆盖 390／768／1280／1920px 布局、周筛选和排序、筛选后的选择／导出范围、OnTrack 文件下载及错误、成绩已得 16.0/100 与剩余需 42.5%、未知权重与公布总评分开显示。所有测试使用独立随机端口服务、MemorySecretStore、临时 OnTrack 目录和阻断／mock 的网络；不使用真实浏览器 profile。
- 响应式截图逐个宽度重新加载后保存；DOM 断言确认仅有一个导航和顶栏，独立截图复查正常。匿名截图位于忽略目录 `build/audit/2026-11-11/ui-regressions/`。

| 本地提交 | 内容 |
|---|---|
| `e7d8c8d` | Moodle 范围缺路由的版本提示 |
| `b2d051f` | 每周资料布局／筛选与 Ed 顺序 |
| `7ff67fe` | Moodle-only API 和共享类型／导航 |
| `3fb8db8` | 成绩解析、Muster 适配与 v3 快照 |
| `5ff8a20` | 作业选择列表增高、筛选与仅 Moodle 导出 |
| `cb143f8` | OnTrack 行内文件入口 |
| `7aacfd0` | 扩展资料筛选、来源边界、下载和成绩的浏览器回归 |
| `00372d3` | 独立加载各视口，稳定响应式截图并断言单一顶栏 |

以上均为本地 commit，未 push。没有真实账号成绩的逐项复核或长期会话观察；本地 404 修复经过实际监听接口状态验证，其他数据行为由隔离 fixture 证明。
