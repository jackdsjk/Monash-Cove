# Attendance Code 自动化：已验证页面结构

日期：2026-10-30  
状态：登录态已验证；未遇到 active code 窗口，填码表单仍待实测。

## 目标

用户第一次登录 Attendance 后，Cove 保存本机 session；以后从 Gmail 解析 attendance code，自动打开对应活动并填入，默认由用户确认提交。

不使用模型 Agent；全部用固定 URL、cookie、正则和 DOM selector。

## 已确认的 Attendance 结构

登录入口：

```text
https://attendance.monash.edu.my/student/
→ Monash Okta
→ https://attendance.monash.edu.my/student/Default.aspx
```

首页：

```html
<a href="Units.aspx">Enter attendance code</a>
<a href="AttendanceInfo.aspx">Attendance by unit</a>
```

Enter attendance code 页面：

```text
https://attendance.monash.edu.my/student/Units.aspx
```

DOM：

```text
#daySel                    日期下拉，value 形如 20_Oct_26
#dayPanel_<date>           当天活动面板
  li.ui-li-static           活动行
    img[src="./img/absent_code.png"]   缺 code / 未记录
    img[src="./img/tick.png"]          已记录
    img[src="./img/question.png"]      未知/PASS
  div.noticeMessage         "Nothing on this day"
```

活动行文本格式：

```text
2:00 pm FIT1047 Workshop 01
6:00 pm ETW2001 Tutorial 07
10:00 am FIT1045 Applied 03
```

Attendance by unit：

```text
https://attendance.monash.edu.my/student/AttendanceInfo.aspx?s=2
```

用途：查学期出勤率，不是 code 填入口。

## 已确认的 cookie

登录后 `attendance.monash.edu.my`：

```text
StudentFedAuth
StudentFedAuth1
StudentFedAuth2
ASP.NET_SessionId_student
```

均为 HttpOnly；需要在登录助手里从浏览器 context 捕获，写入 Keychain。

session 过期后必须重新走 Okta；不能假设永久自动登录。

## 当前阻塞

当前学期已经结束，`Units.aspx` 只显示过去活动：

- 没有 code 输入框；
- 活动行没有链接或点击事件；
- 没有提交表单。

推测 code 输入窗口只在活动进行中/lecturer 开启后出现。下一次有 active session 时，需要捕获：

- code 输入框 selector；
- 活动 URL/参数；
- 提交按钮；
- POST endpoint 和 payload；
- 成功/失败提示；
- 提交后是否更新 `absent_code` → `tick`。

## Gmail 侧

当前 678 封同步邮件：

```text
tennis code: 0 封
attendance code: 10 封
```

已确认用户指的是 attendance code。

标题示例：

```text
FIT1047_S2_2026 - Announcements - [Malaysia Campus] Attendance Code (Week 12)
FIT1058_S2_2026 - Announcements - Attendance Code (Week 12)
FIT1045_S2_2026 - Announcements - [For Malaysia Campus Only] - Week 12: Attendance Codes
```

解析目标：

```text
course = FIT1047_S2_2026
week = 12
codes = {
  "Workshop 1": "3647G",
  "Workshop 2": "MXAUW",
  ...
}
```

## 实现计划

1. `AttendanceLoginAssistant`
   - headed Chrome；
   - 打开 Attendance；
   - 等待 `Default.aspx`；
   - 捕获 cookie；
   - 写入 Keychain `attendance-credentials`；
   - 关闭窗口。

2. `AttendanceCodeParser`
   - Gmail subject regex `/attendance\s*codes?.*week\s*(\d+)/i`；
   - body 行 regex `/^(Workshop|Applied|Tutorial|PASS)\s*\d+\s*:\s*([A-Z0-9]{4,8})/i`；
   - 保存 course/week/session/code。

3. `AttendanceClient`
   - 使用保存的 cookie 调 `Units.aspx`；
   - 解析 `#dayPanel_* li`；
   - 按 course + week/session 匹配活动；
   - 如果页面没有 code 输入框，返回 `inactive`，不硬提交；
   - 检测到 active form 后填入；
   - 默认停在确认页。

4. UI
   - 设置页增加 “Attendance” 连接状态；
   - 首次手动登录；
   - 显示下次可填的 code；
   - 用户确认后提交。

5. 测试
   - 解析器 unit test；
   - 登录 cookie 测试；
   - 有 active session 时做一次 dry-run；
   - 提交后验证出勤状态变化。

## 明确不做

- 不保存 Monash 密码；
- 不绕过 Okta/MFA；
- 不默认自动提交；
- 不在没有 active form 时伪造请求；
- 不把 attendance cookie 上传云端。


## 实现更新（2026-10-31）

已实现第一版：

- `local-service/src/attendance/parser.ts`：Gmail / Moodle 文本 attendance code 解析；
- `local-service/src/attendance/moodle-ocr.ts`：Moodle 图片 label/forums 的内置 Tesseract.js（WASM）OCR，不依赖系统 tesseract；
- `local-service/src/attendance/assistant.ts`：Attendance 登录助手，保存 cookie；
- `local-service/src/attendance/client.ts`：session 验证和一键填入尝试；
- `GET /api/attendance/status`、`GET /api/attendance/codes`、`POST /api/attendance/fill`；
- `webapp/src/pages/AttendancePage.tsx`：签到页面、code 列表、课程/周次筛选、一键填写。

当前“一键填写”如果遇到没有 active code 输入框的页面，会返回 `inactive`，不会猜测提交接口。


## 班次偏好（2026-10-31）

首次连接并打开签到页时，Cove 会从 `Units.aspx` 的活动列表自动识别当前用户的班次，例如：

```text
FIT1047 Workshop 1 / Pass 4 / Applied 8
ETW2001 Tutorial 7
FIT1045 Applied 3 / Pass 3
FIT1058 Workshop 2 / Pass 4 / Applied 1
```

识别结果保存到 `settings.attendance_preferences`，后续 code 列表只显示匹配的课程 + 班次。
用户可以在签到页“我的签到班次”中手动勾选/取消，保存后立即生效。

### 实现文件

- `local-service/src/attendance/preferences.ts`
- `local-service/src/attendance/client.ts` 的 `discoverAttendanceSessions`
- `GET/PUT /api/attendance/preferences`
- `POST /api/attendance/detect`

## 参考项目

参考并学习了：

```text
https://github.com/Waldo0926/monash-attendance-reminder
```

该仓库 README 明确写的是 **All Rights Reserved，不允许修改后再分发，也不允许 fork 后去掉确认步骤**。
因此 Cove 没有复制它的代码；只参考了它的页面流程、`Entry.aspx` 入口、输入框/提交按钮识别思路，再用 Cove 自己的实现重写。
不要把这个参考仓库的代码直接搬进 Cove 公开仓库。

## 一键填写的当前边界

- 优先找 `a[href*="Entry.aspx"]` 的班次入口；
- 找到 Entry 页面后填入 code；
- 默认不点击 Submit；
- 没有 `Entry.aspx`/active input 时返回 `inactive`，不伪造请求；
- 真正的 active 窗口仍需下一次实际签到验证。


## 2026-10-31 修复：其他课程也能显示

原因：FIT1058/FIT1045 的 attendance code 是 **Moodle forum post 图片**，旧 OCR 只扫 Moodle `label`，因此只有文本 code 的 FIT1047 能出现。

修复：

- OCR 扫描 Gmail attendance 邮件正文里的 Moodle `mod/forum/discuss.php` URL；
- 抓取论坛 post 的 `mod_forum/post` 图片；
- 用同一套 tesseract OCR 解析；
- OCR 并发执行，refresh 约 20 秒；
- 根据已选班次过滤。

现在一次 refresh 可得到：

```text
FIT1047
FIT1058
FIT1045
ETW2001
```

并只显示已选班次。


## Tesseract.js 迁移

`moodle-ocr.ts` 已从系统 `tesseract` CLI 改为 `tesseract.js`：

```text
tesseract.js@7
@tesseract.js-data/eng
```

语言数据通过 `langPath` 指向本地 `node_modules/@tesseract.js-data/eng/4.0.0`。
桌面包打包 `local-service/node_modules` 时会一起带入，因此 Windows 不需要安装
Tesseract CLI。

实测一次完整 refresh 约 32 秒，结果覆盖 FIT1047 / FIT1058 / FIT1045 / ETW2001。


## 一键填写当周

签到页新增：

```text
一键填写当周（N）
```

逻辑：

- 使用当前筛选后的本周 code；
- 批量调用 `POST /api/attendance/fill-all`；
- 每条记录独立尝试 Entry.aspx；
- 默认只填入，不自动提交；
- 返回 filled / inactive / notFound 汇总；
- 单条失败不会中断整批。

实测当前（学期结束）批量结果是 `inactive`，因为不存在 active code 输入框。

## 2026-11-06：签到码持久化与增量识别

- 新表 `attendance_codes`：解析出的 code 落库（`origin = text | ocr`），不再只存在于一次响应里；即使原始公告滚动出同步窗口，历史 code 仍然可查。
- 新表 `attendance_scans`：按「行 id + 标题 + 正文 + URL」的内容哈希记录每张图片是否已识别。`?refresh=1` 只处理从未识别过或上次失败的行，第二次刷新约 0.1 秒返回（首次约 30 秒）。
- `?rescan=1` 强制全量重识别；前端「重新识别全部」按钮走这条路径。
- 解析规则保持严格（`Workshop 3: ABC123` 形式），不做模糊匹配；OCR 来源的 code 在界面上标注「OCR 识别，请核对」。
- 同一 code 从 Moodle 与 Gmail 各出现一次时按 `course + week + session + code` 去重。
- 填写成功（`status = filled`）后写入 `filled_at`，保留填写历史。
- `DELETE /api/data` 会一并清空签到码与扫描记录。
