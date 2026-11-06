# Monash Cove 新用户安装与使用说明

## Monash Cove 是什么

Monash Cove 是一个本地优先的校园信息工具。它把 Monash 的 **Gmail、Ed、Moodle** 信息整理成：

- 今日简报；
- 截止倒计时；
- 每周资料；
- Ed 学习内容；
- 签到码与一键填写。

数据尽量保存在本机；不保存密码，不自动提交作业，不代替你发消息。

---

## 一、下载哪个文件

打开 Release 页面：

https://github.com/jackdsjk/Monash-Cove/releases

| 你的电脑 | 下载 |
|---|---|
| Mac M1 / M2 / M3 / M4 | `Monash-Cove-0.1.2-arm64.dmg` |
| Mac 备用 | `Monash-Cove-0.1.2-arm64.zip` |
| Windows 64 位 | `Monash-Cove-0.1.2-win-x64.zip` |

---

## 二、Windows 安装

1. 下载 `Monash-Cove-0.1.2-win-x64.zip`；
2. 右键解压到任意目录；
3. 双击 `Monash Cove.exe`；
4. 如果出现 **Windows 已保护你的电脑**：
   - 点“更多信息”；
   - 点“仍要运行”。
5. Monash Cove 会启动本地服务并打开浏览器。

首次启动后先完成设置向导，再同步数据。

> 当前 Windows 包没有代码签名，所以可能出现 SmartScreen 提示。  
> 这不是病毒提示，但正式使用前请确认下载来源是上面的 GitHub Release。

---

## 三、macOS 安装

1. 下载 `Monash-Cove-0.1.2-arm64.dmg`；
2. 双击打开 DMG；
3. 把 `Monash Cove.app` 拖到 **Applications**；
4. 在 Finder 里推出 DMG；
5. 到 Applications 双击 `Monash Cove`。

### 如果 macOS 阻止打开

这是未签名 App 的 Gatekeeper 提示：

- 右键 `Monash Cove.app` → 打开 → 再点“打开”；
- 或打开 **系统设置 → 隐私与安全性**，找到 Monash Cove，点“仍要打开”。

如果提示“已损坏”，可在终端运行：

```bash
xattr -dr com.apple.quarantine "/Applications/Monash Cove.app"
open "/Applications/Monash Cove.app"
```

Launcher 不会打开独立窗口，它会启动本地服务并打开：

```text
http://127.0.0.1:4317
```

---

## 四、第一次使用

### 1. 设置个人资料

打开：

```text
设置 → 个人资料
```

填写：

- 称呼；
- 校区：马来西亚 / 澳大利亚 / 印度尼西亚。

### 2. 连接来源

打开：

```text
数据源
```

分别连接：

- **Gmail**：Google OAuth；
- **Ed**：Ed API token；
- **Moodle**：Chrome 登录助手，点一下按钮后在窗口里完成 Monash 登录，助手自动捕获整组 cookie（`MoodleSession` + `MDL_SSP_SessID`），不需要手动复制。

Monash Cove 不保存密码，只保存本机凭据 / session。

### 3. 全量同步

打开：

```text
设置 → 全量同步
```

第一次同步可能需要几分钟。之后打开 Monash Cove 会做增量同步。

---

## 五、每个页面能做什么

### 简报

- 汇总 Gmail、Ed、Moodle 的重要信息；
- 按重要性、课程、来源筛选；
- 打开详情查看完整原文；
- 显示作者名字和老师/学生身份；
- 显示老师的回复；
- 点“查看原文”跳转原始邮件 / Ed thread / Moodle 页面；
- 可以做“置顶 / 标为不重要 / 反馈判断”。

### 截止倒计时

- 自动读取 Moodle 作业截止时间；
- 方块网格展示；
- 最大卡片显示最近、最优先的截止项；
- 精确到秒；
- 点击卡片打开对应作业详情。

### 每周资料

- 按 Moodle 课程和板块浏览；
- 区分马来西亚 / 澳大利亚 / 印尼校区；
- 马来西亚课程只显示马来西亚资料；
- 支持多选后批量下载 ZIP；
- 资源文件名优先使用 Moodle 标题；
- 无法直接提取的 label/page 可以下载页面布局 PNG。

### Ed 学习

- 选择 Ed 课程；
- 按 Lesson 浏览；
- 视频：点击“打开视频”；
- 文字：打开 Ed 页面，或下载 Markdown；
- PPT / PDF：直接下载；
- 点击“打包整课”下载整课文字和附件 ZIP。

### 签到

- 从 Gmail / Moodle 找 attendance code；
- Moodle 图片 code 使用内置 Tesseract.js OCR；
- 自动识别你的 Workshop / Applied / Tutorial 班次；
- 手动调整班次；
- 只显示你对应班次的 code；
- 单个“一键填写”；
- “一键填写当周”批量处理；
- 默认只填入，不自动提交。

### 数据源

- 查看 Gmail / Ed / Moodle 连接状态；
- 单独同步某个来源；
- 查看最近错误；
- 重新连接失效的 session。

### 设置

- 个人资料和校区；
- 运行环境检查；
- 全量同步；
- 本地数据清理；
- 隐私边界说明。

---

## 六、当前限制

- 公开版本不包含 Monash Cove 的 Google OAuth client secret，Gmail 需要额外配置；
- macOS Launcher 未使用 Apple Developer ID 签名，可能出现 Gatekeeper 提示；
- Windows 包没有代码签名，可能出现 SmartScreen 提示；
- 没有 active attendance code 表单时，一键填写只会返回“未开始”，不会伪造提交；
- 当前没有应用内自动更新；
- 真实数据只在本机，换电脑不会自动同步。

---

## 七、隐私

- 真实 token、cookie、SQLite 数据只保存在本机；
- 不保存密码；
- Gmail 只读；
- Ed / Moodle 只读；
- 不自动提交作业；
- 不代替你发送消息；
- 公开仓库不包含真实账号数据。
