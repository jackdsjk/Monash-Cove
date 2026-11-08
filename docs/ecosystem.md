# Monash 工具生态清单

*调查日期 2026-10-25 · 数据来自 GitHub 检索 API（33 组查询，923 个仓库筛到 132 个候选，逐个读过约 40 个的 README）*

**怎么调查的**：GitHub 检索覆盖 `monash` / `topic:monash` / `moodle` / `edstem` / `ontrack` / `allocate` / `handbook` / `timetable` / `attendance` / `panopto` / `echo360` / `mcp` / `cli` / `agent` 等关键词，外加 `in:readme` 检索，以及 5 个相关账号（`bunizao`、`Waldo0926`、`MarkChu-git`、`monashcoding`、`TuuHub`）的全部仓库。

**局限**：GitHub 搜索只索引仓库名、描述和 README。私有仓库、Discord 群里的脚本、微信/小红书流传的工具不在其中。星数、更新时间是 2026-10-25 的快照。

---

## 一、四层地图

这个生态已经自然分层了。理解分层比记住项目名重要，因为**你要装什么取决于你缺哪一层**。

| 层 | 作用 | 成熟度 |
|---|---|---|
| **认证** | 过一次 Okta SSO + MFA，存下可复用的会话 | 刚出现（1–2 个） |
| **读取** | 把 Moodle / Ed / OnTrack 变成 CLI 和 MCP | **已经商品化**（≥8 个独立实现） |
| **记忆** | 存历史、算差量、"上周它说什么" | 1 个 |
| **应用** | 给人用的成品：桌面 app、skill、网页 | 3–4 个 |

---

## 二、主表

### 认证层

| 项目 | 干什么 | 许可 | ★ | 最近 | 装？ |
|---|---|---|---|---|---|
| [bunizao/okta-auth](https://github.com/bunizao/okta-auth) | Okta SSO 的 CLI + MCP，持久会话，支持 TOTP / keyring。PyPI `okta-auth-cli` 0.2.3 | MIT | 4 | 10-22 | **值得**，一切的前提（alpha，会变） |

### 读取层（CLI + MCP）

| 项目 | 干什么 | 许可 | ★ | 最近 | 装？ |
|---|---|---|---|---|---|
| [bunizao/moodle-cli](https://github.com/bunizao/moodle-cli) | Moodle：截止、成绩、文件、论坛、quiz。npm 0.11.0 | MIT | 11 | 10-22 | **首选** |
| [bunizao/edstem-cli](https://github.com/bunizao/edstem-cli) | Ed：帖子、回复、Lessons、文件。npm 0.8.2 | MIT | 7 | 10-22 | **首选** |
| [bunizao/ontrack-cli](https://github.com/bunizao/ontrack-cli) | OnTrack/Doubtfire 任务与提交。npm `ontrack` 0.3.2 | MIT | 1 | 10-22 | 可选 |
| [MarkChu-git/Always-Ontrack](https://github.com/MarkChu-git/Always-Ontrack) | OnTrack 的另一实现：`watch` 实时跟踪、反馈、上传。npm `ontrack-cli` 2.5.0 | Apache-2.0 | 3 | 10-15 | **可选，版本更成熟** |
| [Waldo0926/monash-study-kit](https://github.com/Waldo0926/monash-study-kit) | Moodle+Ed 合成一个 MCP，含课件全文检索（FTS5）。**PyPI 无此包**，只能从 git 装 | MIT | 0 | 10-18 | 看情况 |
| [dengliao209-crypto/monash-moodle-skill](https://github.com/dengliao209-crypto/monash-moodle-skill) | Codex Skill，**不是客户端**，是查询工作流：时区、考试要求、考勤规定多源核对 | MIT | 0 | 10-24 | **读一读**，Monash 本地知识最多 |
| [0xca1x/monash-moodle-downloader](https://github.com/0xca1x/monash-moodle-downloader) | CLI：Moodle 文件 + **Panopto 录像 + 字幕** + 字幕翻译 | AGPL-3.0 | 0 | 03-29 | 要录像才装 |
| [GalacticQuasar/ed-discussion-agent](https://github.com/GalacticQuasar/ed-discussion-agent) | 只读 Ed MCP | MIT | 0 | 10-24 | 重复，跳过 |
| [eliemada/edstem-mcp](https://github.com/eliemada/edstem-mcp) | Ed MCP（Python） | MIT | 2 | 08-23 | 重复，跳过 |
| [roshantaneja/ed-api](https://github.com/roshantaneja/ed-api) | Ed API 客户端 + MCP | - | 0 | 05-03 | 重复，跳过 |
| [varbelaiz/moodle-cli](https://github.com/varbelaiz/moodle-cli) · [TaoZhaoyu/moodle-cli](https://github.com/TaoZhaoyu/moodle-cli) · [tidely/moodle-mcp](https://github.com/tidely/moodle-mcp) · [stivenson/moodle_scraper](https://github.com/stivenson/moodle_scraper) | 通用（非 Monash）Moodle CLI/MCP | 各自 | 0–2 | 2026 | 通用场景用，Monash 不如上面 |

### 记忆层

| 项目 | 干什么 | 许可 | ★ | 最近 | 装？ |
|---|---|---|---|---|---|
| [TuuHub/unicorn](https://github.com/TuuHub/unicorn) · [站点](https://unicorn.tuuhub.com) | 每小时读 Moodle/Ed/Canvas/Gmail/RSS，存每个版本，typed change event，14 个 MCP 工具，07:00 digest。**无模型、只读、无观点** | Apache-2.0 | 1（站点标 24） | 10-22 | **值得试**，需 Cloudflare 账号 |

### 应用层

| 项目 | 干什么 | 许可 | ★ | 最近 | 装？ |
|---|---|---|---|---|---|
| [Poetrynan/Muster](https://github.com/Poetrynan/Muster) | 桌面 app：课程、截止、公告、资源聚合。v0.3.2，有安装包 | ⚠️ PolyForm **Noncommercial** | **32** | 10-23 | 自用可，**不能进产品** |
| [jiujiastudy/jiujiastudy](https://github.com/jiujiastudy/jiujiastudy) | 「救驾」Agent Skill：deadline 雷达、本周清单、按状态给建议、后台下课件 | ⚠️ PolyForm **Noncommercial** | **32** | 10-22 | 自用可，**不能进产品** |
| [Waldo0926/monash-hub](https://github.com/Waldo0926/monash-hub) · [在线](https://monashhub.secureview.tech) | Nuxt+FastAPI+Postgres：课程搜索、WAM/GPA 工具、官方指南，标注来源 | 未声明 | 1 | **10-25** | 看，别装 |
| [monashcoding/monmap](https://github.com/monashcoding/monmap) · [在线](https://monmap.monashcoding.com) | MonPlan 替代品（MonPlan 2026-06 下线）：拖拽排课、先修检查、WAM、课程评价 | AGPL-3.0 | 14 | 10-22 | 网页用即可 |
| [Waldo0926/monash-attendance-reminder](https://github.com/Waldo0926/monash-attendance-reminder) | Chrome 扩展：从 Gmail/Ed 里找**考勤码** | - | 1 | 10-17 | 有小用 |
| [hlbbbbbbb/AutoGrade---Monash-](https://github.com/hlbbbbbbb/AutoGrade---Monash-) | Chrome 扩展：从 Moodle 抓分算总成绩 | - | 1 | 2025-09 | 已经过时 |
| [hacker1024/monash_web_enhancements](https://github.com/hacker1024/monash_web_enhancements) | 一堆 userscript 改 Monash 网页 | MIT | 1 | 2025-03 | 跳过 |
| [aidos9/monash_to_ics](https://github.com/aidos9/monash_to_ics) | 课表 .xls → .ics | GPL-3.0 | 0 | 2021 | 太旧 |

### 数据层（handbook，非 agent）

| 项目 | 干什么 | 许可 | 状态 |
|---|---|---|---|
| [monashcoding/TheBetterHandbookAPI](https://github.com/monashcoding/TheBetterHandbookAPI) | handbook API | MIT | 2022，旧 |
| [saikumarmk/monash-handbook-scraper](https://github.com/saikumarmk/monash-handbook-scraper) | Go 写的 handbook 抓取+格式化 | MIT | 2025-10 |
| [jason301c/monash-handbook-api](https://github.com/jason301c/monash-handbook-api) | Go API + Redis + Mongo | - | 旧 |
| [MonPlan/MonScrape](https://github.com/MonPlan/MonScrape) | MonPlan 当年的抓取器 | MIT | 2017，考古 |

---

## 三、许可证警告（重要）

**两个最完整的成品（Muster 32★、救驾 32★）都是 PolyForm Noncommercial。**

意思是：你可以自己装、自己用、自己读它的代码，但**不能把它放进一个商业产品**，也不能拿它的代码做商业分发。

这直接排除了一条路：**"把 Muster 或救驾包装一下卖给学生"**。不是技术问题，是法律问题。

能自由用的（MIT / Apache-2.0）：`moodle-cli`、`edstem-cli`、`ontrack-cli`、`okta-auth`、`unicorn`、`monash-study-kit`、`Always-Ontrack`、`monash-moodle-skill`。

AGPL 的（`monmap`、`0xca1x/monash-moodle-downloader`）：自己用没问题，做成网络服务要开源。

---

## 四、重叠与空白

### 严重重叠

- **Moodle 读取**：≥8 个独立实现（bunizao、Waldo0926、varbelaiz、TaoZhaoyu、tidely、stivenson…）。这一层没有任何机会。
- **Ed 读取**：≥5 个。
- **"聚合 Moodle 到一个界面"**：Muster、救驾、Monash Hub 三家在做，且都是成品。

### 真正的空白

| 空白 | 现状 |
|---|---|
| **政策/规则库** | 迟交罚几分、hurdle、census date、W 上不上成绩单、退款表、special consideration 窗口、奖学金阈值 —— **一个系统性的都没有**。只有 `monash-moodle-skill` 提到"考试要求和考勤规定多源核对" |
| **后果算术** | "final 考多少够 70""现在退课退多少钱" —— 无 |
| **主动推送（不依赖客户端）** | unicorn 有 07:00 digest，但是**变更摘要**，不是判断；救驾/Muster 都是"你打开才有" |
| **课表 / Allocate+** | 只有 2015–2021 的旧项目和 xls→ics。没有现代实现 |
| **跨源冲突展示** | Moodle 说明天、unit guide 说今天 —— 无人处理 |

---

## 五、建议的部署顺序

### 第 1 步：认证 + Moodle（今天就能做完）

```bash
npm install -g moodle-cli
MOODLE_BASE_URL=https://learning.monash.edu moodle auth login
MOODLE_BASE_URL=https://learning.monash.edu moodle user --json
```

成功标志：最后一条返回你的账号信息，而不是只有缓存。

> 待验证：Monash Malaysia 校区是否也用 `learning.monash.edu`。如果不是，换成你登录 Moodle 时的域名。

### 第 2 步：Ed + OnTrack

```bash
npm install -g edstem-cli
edstem auth login          # 需要先在 edstem.org 建 API token

npm install -g ontrack     # bunizao 版，简单
# 或 npm install -g ontrack-cli   # MarkChu 版，2.5.0，有 watch/上传
```

### 第 3 步：记忆层（可选，要 Cloudflare 账号）

```bash
git clone https://github.com/TuuHub/unicorn.git
cd unicorn && npm run setup
```

需要 Node 22+ 和一个免费 Cloudflare 账号。这一步会给你"上周它说什么"的能力，是前面这些 CLI 都没有的。

### 第 4 步：只看不装

- **Muster / 救驾**：装来体验可以，但记住许可证。它们是你最直接的产品参照。
- **monash-moodle-skill**：不装，**读它的 README 和 skill 定义**，里面关于时区、考勤规定、多源核对的思路，是这份清单里唯一接近"Monash 本地知识"的东西。
- **monmap / Monash Hub**：直接用网页。

### 不用装

2015–2021 的 Chrome 扩展、userscript、handbook 抓取器，以及 6 个功能重复的 Moodle MCP。

---

## 六、这份清单对我们意味着什么

1. **读取层彻底商品化**，而且最好用的那几个是 MIT，可以自由依赖。我们不需要写任何 collector。
2. **应用层已经被占了**，但占它的两个是 Noncommercial。商业空间没有被关闭，只是那条路不能靠抄。
3. **规则层完全空着**，而且空着的理由不是难，是慢 —— 要读 PDF、问 faculty、标出处、每年重校。
4. **课表层也空着**，但价值低（iCal 导出就解决大半），不建议碰。

一句话：**工具齐了，判断没有；判断难的不是技术，是取证。**
