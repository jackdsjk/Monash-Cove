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
- `local-service/src/attendance/moodle-ocr.ts`：Moodle 图片 label 的 tesseract OCR；
- `local-service/src/attendance/assistant.ts`：Attendance 登录助手，保存 cookie；
- `local-service/src/attendance/client.ts`：session 验证和一键填入尝试；
- `GET /api/attendance/status`、`GET /api/attendance/codes`、`POST /api/attendance/fill`；
- `webapp/src/pages/AttendancePage.tsx`：签到页面、code 列表、课程/周次筛选、一键填写。

当前“一键填写”如果遇到没有 active code 输入框的页面，会返回 `inactive`，不会猜测提交接口。
