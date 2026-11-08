# UI 组件审计与小幅替换（2026-10-30）

## 1. 现状清单

| 区域 | 当前实现 | 文件 |
|---|---|---|
| 侧栏 / 顶栏 | Ant Design `Layout`、`Menu`、`Badge` | `webapp/src/components/AppShell.tsx` |
| 简报卡片 | Ant Design `Card`、`Tag`、`Badge` | `webapp/src/components/ItemCard.tsx` |
| 详情面板 | Ant Design `Drawer`、`Descriptions` | `webapp/src/components/ItemDrawer.tsx` |
| 反馈 | Ant Design `Modal`、`Form`、`Radio` | `webapp/src/components/FeedbackModal.tsx` |
| 截止倒计时 | Ant Design `Card`、`Tag` + 自写时间分组 | `webapp/src/components/DeadlineCountdown.tsx` |
| 每周资料 | Ant Design `Card`、`Select`、`Segmented`、`Checkbox` | `webapp/src/pages/MaterialsPage.tsx` |
| 全局样式 | 原生 CSS + Ant Design token | `webapp/src/styles.css`、`theme.ts` |

判断：现有 Ant Design 组件已经覆盖业务形态，**不应为了换库而重写**。本次只做增量补强。

## 2. 仓库与索引

| 仓库 | 本地路径 | 版本 | 索引 |
|---|---|---|---|
| shadcn-ui/ui | `refs/ui-shadcn` | `96da9cc` | CodeGraph up to date，6,411 files |
| nuxt/ui | `refs/ui-nuxt` | `200b0bf` | CodeGraph up to date |
| mui/material-ui | `refs/ui-mui` | `3449961` | CodeGraph up to date；sparse checkout 只取 `mui-material` / `mui-lab` / `mui-system` |

`refs/` 已被根 `.gitignore` 忽略，不会提交第三方源码。

CodeGraph 查询示例：

```bash
codegraph query -p refs/ui-shadcn "CommandDialog"
codegraph query -p refs/ui-mui "Timeline"
codegraph query -p refs/ui-nuxt "CommandPalette"
```

## 3. 组件筛选

- **shadcn**：`command.tsx` 的 `CommandDialog` / `CommandInput` / `CommandItem` 模式适合做全局跳转搜索；但直接复制需要 Tailwind、Radix、`cn`、`lucide`，与现有 Ant Design + 原生 CSS 冲突。
- **MUI**：`Timeline`、`Chip`、`Stepper` 可用；但会引入 `@mui/material` + Emotion，和 AntD 的视觉/主题重复，包体增加明显，不适合这次“小幅度”修改。
- **Nuxt UI**：`CommandPalette.vue`、`Timeline.vue`、`Stepper.vue` 设计可参考；但它是 Vue 组件，不能直接放进 React/Vite。

## 4. 替换表

| 位置 | 原组件 | 候选 | 决定 |
|---|---|---|---|
| 顶栏 | 纯文本状态 | shadcn Command / cmdk | **新增** `CommandPalette`，用 shadcn 的 command 结构 + `cmdk`，外壳用 AntD Modal |
| 侧栏 | AntD Menu | shadcn Sidebar / Nuxt DashboardSidebar | **保留** AntD；不引入 Tailwind/Vue |
| 简报卡片 | AntD Card | shadcn Card / MUI Card | **保留**；视觉已匹配，不重复造 |
| 详情 Drawer | AntD Drawer | shadcn Sheet / MUI Drawer | **保留**；现有响应式和无障碍已可用 |
| 反馈 Modal | AntD Modal | shadcn Dialog / MUI Dialog | **保留**；不增加第二套 Dialog |
| 倒计时 | AntD Card 分组 | MUI Timeline / shadcn Progress | **保留**；MUI 引入成本大于收益 |
| 资料筛选 | AntD Input/Segmented/Select | shadcn Command | **保留**；筛选是表单，不是命令面板 |
| 新功能 | — | shadcn command pattern | **已新增**：`Cmd/Ctrl+K` 全局跳转 |

## 5. 已执行的改动

- 安装 `cmdk@1.1.1`；
- 新增 `webapp/src/components/CommandPalette.tsx`；
- 顶栏新增“搜索或跳转”入口，支持 `Cmd/Ctrl+K`；
- 样式沿用 Cove 的绿色 token 和原生 CSS，不引入 Tailwind/Radix；
- E2E 增加命令面板打开、跳转数据源、返回简报的覆盖。

## 6. 验证

```bash
cd webapp && npm run check
cd webapp && npm run e2e
```

结果：构建通过，Playwright E2E 通过。命令面板已实际截图检查，桌面/移动端布局正常。

## 7. 后续

- 如果以后需要更复杂的命令面板（搜索条目、执行同步、切换课程），再评估 `cmdk` 的 group/async 能力；
- 仍不建议为了“换库”引入 MUI + Emotion 或 Tailwind；
- Nuxt UI 只作为设计参考，不作为 React 依赖。
