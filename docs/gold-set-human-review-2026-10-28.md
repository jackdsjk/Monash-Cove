# Cove Gold Set 真人复核表 v0.1

> 这是给项目所有者使用的人工复核表。当前 55 条内容是匿名改写样本，不含原始邮件、帖子或链接。
> 请先独立填写，再对照两轮 agent-assisted 标注和裁决记录。

## 使用方式

1. 先只看下面的样本内容，不打开第一轮、第二轮标注文件。
2. 每条样本勾选重要性、行动要求、是否打开原文和证据充分性。
3. 填写一个内容类型、重复组、一句话结论和必要备注。
4. 完成 55 条后，再对照裁决记录处理分歧。不要修改两轮原始标注文件。

## 选项说明

- 重要性：`C` = critical，`I` = important，`R` = reference，`S` = skip。
- 行动：`Y` = 明确需要行动，`N` = 不需要行动，`U` = 不确定或需要核实。可选活动通常选 `N`。
- 原文：`R` = 必须打开，`O` = 可选，`N` = 不用打开。
- 证据：摘要中的关键结论能否被样本文本直接支持。
- 内容类型可填写：required_action、requirement_change、staff_announcement、staff_answer、peer_question、learning_material、assessment_fact、administrative、promotion、noise。

## 样本复核

### 01 · gmail-001 · gmail · ETW2001

**Assignment 3 parts A and B: requirements updated**

> The teaching team has clarified the submission requirements for Assignment 3. Part A remains unchanged, but Part B must now include a short comparison table. The updated specification is available in the course site.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[] 足够　[✅] 不足
- 内容类型：作业提交内容明确
- 语义重复组（没有填“无”）：无
- 一句话结论：很关键，因为明确说明了Part B要提交一个comparison table
- 复核备注：无

### 02 · gmail-002 · gmail · FIT1058

**Assignment 2 Part 3 Q&A session registration**

> A voluntary Q&A session for Assignment 2 Part 3 will be held next week. Students who want to attend should register using the course form before the session reaches capacity.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[] 足够　[✅] 不足
- 内容类型：自愿性报名参加的课后活动
- 语义重复组（没有填“无”）：无
- 一句话结论：一个自愿性参加的活动，但预计会对 assignment two part three 的 QA session 比较有帮助。
- 复核备注：AI建议，待人工复核。

### 03 · gmail-003 · gmail · FIT1058

**Assignment 2 Part 3 Q&A: reminder**

> Reminder: registration for the Assignment 2 Part 3 Q&A session closes tomorrow. The session is optional and will not be recorded.

- 重要性：[] C　[✅] I　[ ] R　[ ] S
- 行动：[] Y　[ ] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：是02的后续
- 一句话结论：通知一个对作业可能比较有帮助的一个自愿性参加的活动即将关闭注册。
- 复核备注：AI建议，待人工复核。

### 04 · gmail-004 · gmail · FIT1058

**Additional Q&A session for Assignment 2 Part 3**

> An additional Q&A session has been opened for Assignment 2 Part 3 after the first session filled. Registration is optional and closes at the end of the day.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[] R　[✅] O　[ ] N
- 证据：[ ] 足够　[✅] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：02,03的延后
- 一句话结论：之前那个自愿性参加的活动的通知，说是新开了一个 session可以参加。
- 复核备注：AI建议，待人工复核。

### 05 · gmail-005 · gmail · FIT1058

**Assignment 2 Part 3 Q&A: final registration notice**

> This is the final notice for the optional Assignment 2 Part 3 Q&A. Use the registration form if you need to attend; no registration is needed to submit the assignment.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：not sur
- 一句话结论：这个是之前那个自愿性参加活动的报名的最后通知。
- 复核备注：AI建议，待人工复核。

### 06 · gmail-006 · gmail · FIT1058

**SETU survey reminder and gift-card promotion**

> Students are invited to complete the end-of-unit survey for a chance to enter a gift-card draw. The survey is not described as a course requirement.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：推广/自愿活动（promotion）
- 语义重复组（没有填“无”）：无
- 一句话结论：一个调查问卷，填不填都可以。但填了有可能能赢大奖，以及对学校可能有反馈作用，但不填不会有任何损失。
- 复核备注：AI建议，待人工复核。

### 07 · gmail-007 · gmail · 无课程

**Peer Student Supporter recruitment**

> The student wellbeing office is recruiting volunteers for a peer-support program. Applications are open to interested students and are unrelated to course assessment.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：推广/自愿活动（promotion）
- 语义重复组（没有填“无”）：无
- 一句话结论：这类似于课外活动和社团，与课程和考试无关，但是如果有兴趣可以参加。
- 复核备注：AI建议，待人工复核。

### 08 · gmail-008 · gmail · 无课程

**Campus wellbeing day trip promotion**

> A student association is advertising an optional wellbeing day trip during the exam period. Tickets are limited and the message contains no academic requirement.

- 重要性：[ ] C　[ ] I　[ ] R　[✅] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：推广/自愿活动（promotion）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是可选的校园活动推广，不包含学业要求。
- 复核备注：AI建议，待人工复核。

### 09 · gmail-009 · gmail · FIT1058

**Clayton seminar recording available**

> The teaching team has uploaded a recording of the recent seminar and a copy of the slides. The material is supplementary and no completion action is requested.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：无
- 一句话结论：FIT1058 的研讨会录播和幻灯片已提供，属于补充学习材料。
- 复核备注：AI建议，待人工复核。

### 10 · gmail-010 · gmail · 无课程

**Scheduled library systems outage**

> Library search and several borrowing services will be unavailable during a scheduled maintenance window this weekend. Students should plan research access around the outage.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：无
- 一句话结论：图书馆部分系统将在周末维护，可能影响研究资料访问。
- 复核备注：AI建议，待人工复核。

### 11 · gmail-011 · gmail · 无课程

**New sign-in notification**

> A new browser sign-in was detected for the university account. The notice includes a device and approximate location that the account owner should verify. If it was not the owner, the account security steps should be followed immediately.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：dup-university-sign-in
- 一句话结论：系统检测到陌生设备登录，用户需要立即核验并在非本人操作时采取安全措施。
- 复核备注：AI建议，待人工复核。

### 12 · gmail-012 · gmail · 无课程

**New sign-in notification: duplicate alert**

> A second notification reports the same unfamiliar browser sign-in for the university account. It points to the same security review instructions.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：dup-university-sign-in
- 一句话结论：这是与前一条相同登录事件的重复安全通知。
- 复核备注：AI建议，待人工复核。

### 13 · gmail-013 · gmail · 无课程

**Extension application received**

> The university has received an extension request and will review the supporting information. This message confirms receipt only; it does not approve or reject the request.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：dup-extension-receipt
- 一句话结论：学校已收到延期申请，但目前只确认收件，尚未作出决定。
- 复核备注：AI建议，待人工复核。

### 14 · gmail-014 · gmail · 无课程

**Extension application received: duplicate**

> A duplicate confirmation says the extension request is under review. No outcome or new deadline is stated.

- 重要性：[ ] C　[ ] I　[ ] R　[✅] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：dup-extension-receipt
- 一句话结论：这是延期申请在审核中的重复确认，没有新的结果或截止时间。
- 复核备注：AI建议，待人工复核。

### 15 · gmail-015 · gmail · 无课程

**Student Barometer survey reminder**

> The university is asking students to complete a voluntary Student Barometer survey before it closes. The message asks for feedback but does not state that completion affects enrolment or grades.

- 重要性：[ ] C　[ ] I　[ ] R　[✅] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：推广/自愿活动（promotion）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是自愿的学生体验调查提醒，不影响课程成绩或注册。
- 复核备注：AI建议，待人工复核。

### 16 · gmail-016 · gmail · FIT1047

**Short extension approved for Assignment 4 Part 3**

> A short extension has been approved for Assignment 4 Part 3. The original due time and the revised due time are listed in the notice. Students should check the assessment page before submitting.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：要求/截止时间变化（requirement_change）
- 语义重复组（没有填“无”）：dup-fit1047-part3-deadline
- 一句话结论：FIT1047 Assignment 4 Part 3 获批短期延期，提交前必须核对新的截止时间。
- 复核备注：AI建议，待人工复核。

### 17 · gmail-017 · gmail · FIT1047

**Short extension approved for Assignment 4 Part 4**

> A short extension has been approved for Assignment 4 Part 4. The revised deadline differs from Part 3, so the student should verify which part the approval covers.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：要求/截止时间变化（requirement_change）
- 语义重复组（没有填“无”）：dup-fit1047-part4-deadline
- 一句话结论：FIT1047 Assignment 4 Part 4 获批延期，且截止时间与 Part 3 不同。
- 复核备注：AI建议，待人工复核。

### 18 · gmail-018 · gmail · 无课程

**Retail account one-time password**

> A shopping service sent a one-time password for an attempted sign-in. The message is unrelated to study and advises the recipient not to share the code.

- 重要性：[ ] C　[ ] I　[ ] R　[✅] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：噪音/无关内容（noise）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是与学习无关的购物账户一次性密码通知。
- 复核备注：AI建议，待人工复核。

### 19 · gmail-019 · gmail · 无课程

**Student election: final voting reminder**

> Students are reminded that voting in an optional student representative election closes today. The message contains candidate information and no academic consequence.

- 重要性：[ ] C　[ ] I　[ ] R　[✅] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：推广/自愿活动（promotion）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是可选学生代表选举的最后提醒，不涉及学业后果。
- 复核备注：AI建议，待人工复核。

### 20 · gmail-020 · gmail · 无课程

**Tuition payment deadline changed**

> The student finance office has moved the payment deadline for the next teaching period. Students with an outstanding balance must review the new date and contact finance if they cannot pay on time.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：无
- 一句话结论：学校财务处调整了缴费截止时间，有未缴余额的学生需要核对并在不能按时支付时联系财务处。
- 复核备注：AI建议，待人工复核。

### 21 · gmail-021 · gmail · FIT1045

**Classroom change for the final test**

> The final test will be held in a different room than the one shown in the earlier timetable. Students must use the new room listed in the announcement.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：要求/截止时间变化（requirement_change）
- 语义重复组（没有填“无”）：dup-fit1045-final-test
- 一句话结论：FIT1045 final test 的考场已变更，学生必须使用公告中的新地点。
- 复核备注：AI建议，待人工复核。

### 22 · gmail-022 · gmail · 无课程

**Exam timetable room update**

> The university exam timetable now lists the room and check-in instructions for the upcoming exam period. The update affects attendance logistics but does not change the exam date.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：无
- 一句话结论：考试时间表新增了考场和签到说明，但没有改变考试日期。
- 复核备注：AI建议，待人工复核。

### 23 · gmail-023 · gmail · 无课程

**Counselling appointment confirmation**

> A counselling service confirms an appointment time and asks the student to reply if the time no longer works. The appointment is private and unrelated to course requirements.

- 重要性：[ ] C　[ ] I　[ ] R　[✅] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：行政/系统事务（administrative）
- 语义重复组（没有填“无”）：无
- 一句话结论：心理咨询服务确认了预约时间，并允许用户在不合适时回复调整。
- 复核备注：AI建议，待人工复核。

### 24 · gmail-024 · gmail · FIT1047

**Course announcement: optional practice questions**

> The teaching team has posted a set of optional practice questions for the next topic. The questions are for revision and are not collected or graded.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：无
- 一句话结论：FIT1047 提供了可选的练习题用于复习，不收集也不评分。
- 复核备注：AI建议，待人工复核。

### 25 · gmail-025 · gmail · FIT1045

**Final test: last sitting and room details**

> The final test has one remaining sitting. The message gives the date and room and reminds students that passing the test is required to pass the unit.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：dup-fit1045-final-test
- 一句话结论：FIT1045 final test 只剩一个场次，公告同时给出地点并说明通过测试是通过课程的条件。
- 复核备注：AI建议，待人工复核。

### 26 · ed-001 · ed · FIT1045

**Where should the consolidated code be uploaded?**

> A student asks whether the consolidated source code should be placed in the PDF, the ZIP archive, or both because the submission form shows only two upload slots. A staff reply says to include it in the ZIP and use the PDF for the report.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：FIT1045 教师明确了 consolidated code 应放在 ZIP 中，PDF 用于报告。
- 复核备注：AI建议，待人工复核。

### 27 · ed-002 · ed · FIT1047

**Week 12 task: password storage notes**

> A student posts draft notes explaining salted password hashing and slow password-hashing functions. No question about assessment requirements is asked and no staff reply is present.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：dup-fit1047-password-hashing
- 一句话结论：这是学生关于盐值密码哈希的学习笔记，没有教师结论或要求变化。
- 复核备注：AI建议，待人工复核。

### 28 · ed-003 · ed · FIT1047

**Week 10 task: PKI explanation**

> A student shares a draft explanation of public-key infrastructure and certificate authorities as part of a weekly learning task. The post has no staff correction or deadline change.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是学生关于 PKI 的学习任务草稿，没有教师修正或截止变化。
- 复核备注：AI建议，待人工复核。

### 29 · ed-004 · ed · FIT1045

**Can a member initialisation list set a constant?**

> A student asks whether a constructor member initialisation list can set an instance constant. A staff reply confirms the pattern and points to a language reference example.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师确认了用 constructor member initialisation list 设置 instance constant 的方式。
- 复核备注：AI建议，待人工复核。

### 30 · ed-005 · ed · FIT1058

**Attempt at an exam proof**

> A student posts an attempted proof for a past exam question. Other students can use it for revision, but the post is not an official solution and no staff answer is attached.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是学生对往年考试题的证明尝试，可用于复习但不是官方答案。
- 复核备注：AI建议，待人工复核。

### 31 · ed-006 · ed · FIT1047

**Career task: security analyst role notes**

> A student shares notes about a security analyst job description while completing a career-related learning task. The post does not change the task requirements or request a staff decision.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是学生为职业学习任务分享的安全分析师岗位笔记，不改变任务要求。
- 复核备注：AI建议，待人工复核。

### 32 · ed-007 · ed · FIT1058

**Question about a logic equivalence proof**

> A student asks whether a proposed transformation proves a logic equivalence. No staff or tutor response has been posted yet, so the correctness of the approach is unresolved.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：无
- 一句话结论：学生在询问逻辑等价证明是否成立，但尚无权威回复。
- 复核备注：AI建议，待人工复核。

### 33 · ed-008 · ed · FIT1047

**Is a six-minute presentation acceptable?**

> A student asks whether a presentation shorter than the stated maximum is acceptable. A staff response says the maximum is not a minimum and reminds students to cover all required points.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师说明演示时长上限不是最低要求，但学生仍需覆盖所有要求点。
- 复核备注：AI建议，待人工复核。

### 34 · ed-009 · ed · FIT1047

**Assignment 4 Part 2 slide structure**

> A student asks whether the required points for Assignment 4 Part 2 can be paraphrased on slides and whether evidence must be shown for every point. No official answer is visible yet.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：无
- 一句话结论：学生询问 Assignment 4 Part 2 的幻灯片能否改写，以及是否每点都要提供证据；目前没有官方答案。
- 复核备注：AI建议，待人工复核。

### 35 · ed-010 · ed · FIT1047

**Question about secure password storage**

> A student asks whether a password manager or salted hashing should be discussed in the weekly answer. The thread contains peer suggestions but no staff conclusion.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：dup-fit1047-password-hashing
- 一句话结论：学生询问密码管理器和盐值哈希在周任务中的取舍，但只有同学建议。
- 复核备注：AI建议，待人工复核。

### 36 · ed-011 · ed · FIT1058

**Can I pass after failing the unit hurdle?**

> A student asks whether a high exam result can compensate for failing the in-semester hurdle. A staff reply explains that the hurdle is a separate pass condition.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师说明 unit hurdle 是独立的通过条件，高考试成绩不能自动补偿未通过 hurdle。
- 复核备注：AI建议，待人工复核。

### 37 · ed-012 · ed · FIT1058

**Week 12 wrap-up and seminar recording**

> A staff announcement links a final seminar recording and invites general feedback about the unit. It does not introduce a new assessment requirement or deadline.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师发布了期末研讨会录播并邀请反馈，没有新增作业要求或截止时间。
- 复核备注：AI建议，待人工复核。

### 38 · ed-013 · ed · FIT1047

**Can an AI assistant be cited as a reference?**

> A student asks whether an AI assistant can be included as a reference for Assignment 4 Part 2. A staff reply says the answer depends on the assessment's source rules and points to the referencing section.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师说明 AI 工具能否作为参考文献取决于 assessment 的 source rules，并指向引用规范。
- 复核备注：AI建议，待人工复核。

### 39 · ed-014 · ed · FIT1047

**Week 9 future internet prediction**

> A student posts a speculative response about how internet infrastructure may change in the future. The post is part of a learning task and has no staff feedback.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：无
- 一句话结论：这是学生对未来互联网的推测性学习回答，没有教师反馈。
- 复核备注：AI建议，待人工复核。

### 40 · ed-015 · ed · FIT1047

**Student explanation of password hashing**

> A student posts a second explanation of salted password hashing for a weekly task. It is similar to another student discussion but is not an official answer.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[ ] O　[✅] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学习材料（learning_material）
- 语义重复组（没有填“无”）：dup-fit1047-password-hashing
- 一句话结论：这是另一条关于盐值密码哈希的学生学习说明，与其他同学讨论相似但不是官方答案。
- 复核备注：AI建议，待人工复核。

### 41 · ed-016 · ed · FIT1047

**Can the presentation video exceed eight minutes?**

> A student says the presentation is over the eight-minute maximum because of pauses. A staff reply says the submission must be edited to meet the maximum duration.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师明确要求超过八分钟的视频必须剪辑到时长上限以内。
- 复核备注：AI建议，待人工复核。

### 42 · ed-017 · ed · FIT1045

**Final test: last sitting and room details**

> A staff announcement states that the final test has one remaining sitting, gives the date and room, and reminds students that passing the test is required to pass the unit.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：dup-fit1045-final-test
- 一句话结论：FIT1045 教师宣布最后一次 test 的日期和房间，并说明通过 test 是通过课程的条件。
- 复核备注：AI建议，待人工复核。

### 43 · ed-018 · ed · FIT1058

**Updated link for today's Q&A session**

> A staff announcement says the original video-conference link is unreliable and gives a replacement link for a Q&A session happening later today.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：要求/截止时间变化（requirement_change）
- 语义重复组（没有填“无”）：无
- 一句话结论：今天的 Q&A 使用替换后的会议链接，旧链接可能不可靠。
- 复核备注：AI建议，待人工复核。

### 44 · ed-019 · ed · FIT1045

**How will the honours interview be scheduled?**

> A student asks whether an interview time will appear in the learning platform or the university timetable. No staff response has been posted, so the scheduling process remains uncertain.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：无
- 一句话结论：学生询问 honours interview 的排期入口，但当前没有 staff 回复。
- 复核备注：AI建议，待人工复核。

### 45 · ed-020 · ed · FIT1045

**Do global constants count as global variables?**

> A student asks whether a project restriction on global variables also prohibits global constants. A staff reply says the restriction applies to mutable global state, but the student should follow the exact project specification.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师将 global variables 的限制解释为针对 mutable global state，并提醒仍需遵守 project specification。
- 复核备注：AI建议，待人工复核。

### 46 · ed-021 · ed · FIT1058

**SETU and practice-exam reminders**

> A staff post reminds students about the optional SETU survey and links several practice exams. The post does not state that the survey is required or graded.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[✅] N　[ ] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师/学校通知（staff_announcement）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师提醒 SETU 和练习考试，但没有说 SETU 是必修或计分。
- 复核备注：AI建议，待人工复核。

### 47 · ed-022 · ed · FIT1047

**Video submission guidelines not in the specification**

> A student asks for guidance about how long each slide should remain visible and whether the speaker must appear on camera. No staff answer has been posted.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：无
- 一句话结论：学生询问视频的幻灯片时长和出镜要求，但目前没有 staff 答案。
- 复核备注：AI建议，待人工复核。

### 48 · ed-023 · ed · FIT1045

**Exact H2 feedback deadline**

> A student asks whether the feedback deadline means the end of Sunday or an earlier time. A staff reply confirms the exact local cutoff and says late feedback requests cannot be guaranteed.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：教师正式答复（staff_answer）
- 语义重复组（没有填“无”）：无
- 一句话结论：教师确认 H2 feedback 的本地截止时间是周日结束，并提醒逾期请求不一定受理。
- 复核备注：AI建议，待人工复核。

### 49 · ed-024 · ed · MPU3312

**Question about the reflective quiz format**

> A student asks whether a reflective quiz permits multiple attempts and whether only the highest attempt counts. No teaching-team answer is present.

- 重要性：[ ] C　[ ] I　[✅] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[ ] R　[✅] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：无
- 一句话结论：学生询问 reflective quiz 的重试和计分规则，但尚无教学团队回答。
- 复核备注：AI建议，待人工复核。

### 50 · ed-025 · ed · FIT1047

**Article link cannot be opened by the AI tool**

> A student says the article link required for a learning task is blocked by the AI tool and asks whether a downloaded copy can be used. No staff answer is visible.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[ ] Y　[ ] N　[✅] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：学生提问（未有权威答复）（peer_question）
- 语义重复组（没有填“无”）：无
- 一句话结论：学生无法通过 AI 工具打开学习任务要求的文章链接，正在询问是否可以使用下载副本。
- 复核备注：AI建议，待人工复核。

### 51 · moodle-001 · moodle · FIT1047

**Assignment 4 Part 1 submission deadline**

> The course assessment page lists the submission deadline for Assignment 4 Part 1 as 11:55 pm on the published date. The item is an official system record of a due time.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：系统 assessment 事实（assessment_fact）
- 语义重复组（没有填“无”）：无
- 一句话结论：Moodle 记录了 FIT1047 Assignment 4 Part 1 的正式提交截止时间。
- 复核备注：AI建议，待人工复核。

### 52 · moodle-002 · moodle · FIT1047

**Assignment 4 Part 2 submission deadline**

> The course assessment page lists the submission deadline for Assignment 4 Part 2 as 11:55 pm on the published date. The item is an official system record of a due time.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：系统 assessment 事实（assessment_fact）
- 语义重复组（没有填“无”）：无
- 一句话结论：Moodle 记录了 FIT1047 Assignment 4 Part 2 的正式提交截止时间。
- 复核备注：AI建议，待人工复核。

### 53 · moodle-003 · moodle · FIT1047

**Assignment 4 Part 3 submission deadline override**

> The course assessment page shows a due-date override for Assignment 4 Part 3. The override changes the submission deadline shown for the student and should take precedence over the earlier date.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：要求/截止时间变化（requirement_change）
- 语义重复组（没有填“无”）：dup-fit1047-part3-deadline
- 一句话结论：Moodle 显示 Assignment 4 Part 3 的截止时间被 override 更新，应以新日期为准。
- 复核备注：AI建议，待人工复核。

### 54 · moodle-004 · moodle · FIT1047

**Assignment 4 Part 4 submission deadline override**

> The course assessment page shows a due-date override for Assignment 4 Part 4. The override changes the submission deadline shown for the student and should take precedence over the earlier date.

- 重要性：[✅] C　[ ] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：要求/截止时间变化（requirement_change）
- 语义重复组（没有填“无”）：dup-fit1047-part4-deadline
- 一句话结论：Moodle 显示 Assignment 4 Part 4 的截止时间被 override 更新，应以新日期为准。
- 复核备注：AI建议，待人工复核。

### 55 · moodle-005 · moodle · MPU3312

**Self-reflective question quiz closing time**

> The course quiz page lists a closing time for the self-reflective question activity. Students who intend to complete it must submit before the closing time; the item does not state that late attempts are accepted.

- 重要性：[ ] C　[✅] I　[ ] R　[ ] S
- 行动：[✅] Y　[ ] N　[ ] U
- 原文：[✅] R　[ ] O　[ ] N
- 证据：[✅] 足够　[ ] 不足
- 内容类型：系统 assessment 事实（assessment_fact）
- 语义重复组（没有填“无”）：无
- 一句话结论：Moodle 列出了 reflective question quiz 的关闭时间，计划完成的学生需要在此之前提交。
- 复核备注：AI建议，待人工复核。


## 最终签核

- [x] 我已独立复核 55/55 条样本。
- [x] 我已检查每条证据是否支持对应结论。
- [x] 我已记录所有分歧及裁决理由。
- [x] 我确认这批结果只适用于匿名改写样本的原型评测。
- [x] 后续如要作为真实 Gold Set，我会另行复核受控脱敏的真实样本。

复核日期：2026-10-28

复核者角色：project_owner

总体备注：匿名改写样本通过项目所有者复核，可用于原型评测；不代表真实脱敏 Gold Set 已完成。
