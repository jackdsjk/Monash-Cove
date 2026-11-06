# Cove 展示片 · STATUS

更新时间：2026-11-02 23:40
当前阶段：**final（返修 P2 已实现，待作者审片）**
下一阶段：配乐 / 封面 / 45–51 秒精简版

## 已完成

### card
- [x] BRIEF / DECISIONS 建立，6 条决定落档
- [x] 任务卡 12 节写完（`card/任务卡.md`，v2）
- [x] `task.json` 通过结构校验（20 事件 / 9 场景 / 64 秒）
- [x] 四案音乐方案（`card/music-plan.md`，只写未生成）
- [x] 风格卡（`card/style/COVE-DESIGN.md`，替代 341 库，破例已记录）

### still
- [x] 展示账号数据集：47 条（Ed 25 / Gmail 17 / Moodle 5），最近 24h 14 条、critical 6 条
- [x] 隔离实例：`COVE_DATA_DIR` + `COVE_SECRET_STORE=memory` + `COVE_AUTO_SYNC=0` + `COVE_PORT=4400`
- [x] 8 张真实截图（Playwright，1280×800 @3x，关闭动画）
- [x] Remotion 工程（remotion 4.0.539，Node 22）
- [x] 中文字体 Noto Sans SC（Regular/Medium/Bold，SIL OFL）
- [x] 签到页与填写结果截图（拦 API 的演示数据，界面真实）
- [x] 9 张静帧渲染于 `showcase/out/S01..S09.png`

## 本轮改了什么代码

| 文件 | 改动 | 原因 |
|---|---|---|
| `local-service/src/index.ts` | 新增 `COVE_FIXTURE_PATH` 环境变量（1 行 + 注释） | 展示实例需要用独立数据集启动，避免覆盖仓库默认 fixture |
| `showcase/**` | 新建 | 视频工程，独立于 webapp / local-service |

`local-service` 其余代码未动，`npm run build` 通过。

## 验证

| 项 | 结果 |
|---|---|
| `task.json` 结构校验 | passed，errors: [] |
| 事件 ID 与任务卡一致 | 19 = 19，无差异 |
| 展示实例数字 | 47 总数 / 14 近期 / 6 critical / 5 个截止项 |
| 字幕数字来源 | 全部来自截图上的统计卡，非另行计算 |
| 签到页数据 | 由 `capture-mock.mjs` 拦截 `/api/attendance/*` 提供，页面真实渲染 |
| 字体 | cmap 覆盖全部用字；`替/翻` 相邻有渲染缺陷（见下） |

## 已知问题

1. **`你`+`翻` 相邻时叠字**。Remotion 的无头 Chrome 里这对字形会重叠，纯 Chrome 页面不会。已通过把字幕改成"所以它先替你看了一遍。"规避；根因未定位，**新文案如果出现类似叠字，先怀疑这对字**。
2. **S02 的日历格是界面之外的自绘元素**（唯一一处）。已在任务卡 R12 标为待作者判断。
3. **抽屉里的"判断来源"区块**会显示模型名与规则版本；S05 的裁切已避开，但成片如果拉远会露出来。
4. **同步功能演不了**：展示实例无凭据，`POST /api/sync` 返回 `not_connected`。S04 已改为筛选交互（R13）。
5. **签到页是"真界面 + 假数据"**：`/api/attendance/*` 被 Playwright 拦截，返回 3 条演示 code。页面显示的"已连接"是演示状态，公开视频里不要声称是某个真实账号。
6. **Ed 学习页未拍**：同样可以用拦截法出图，本轮未做。


## v4 · 运动返修（2026-11-03）

作者指出成片"过于不对劲"，实测确认：初版 9 段里 6 段运动帧占比 0%，等于逐句贴卡的 PPT，违反 SKILL 质量底线。

已重写 `scenes.tsx` 的运动层：
- S01 满幅面板 + 镜头推近/拉远 + 高亮从左扫过（运动帧 0% → 17.9%）
- S02 纸条弹簧飞入、撞合（保留）
- S03 整张卡从右下小尺寸长到卡片位（0% → 6.7%）
- S04 镜头推近 + 光标入场 + 列表收敛位移
- S05 抽屉弹簧 + 引文高亮扫过（21% → 10%，时长更长所以占比下降）
- S06 横向滑页 + 空态落定
- S07 光标移动 + toast 下落
- S08/S09 刻意的安静段（能量曲线最低点），保持静止

仍未解决：S04/S07 的光标动作偏小；**全片无配乐**。


## 技能环境（2026-11-03 补装）

| 组件 | 位置 | 状态 |
|---|---|---|
| fy-code-animation | `~/Documents/Codex/Codex-skills-hub/active/agents/fy-code-animation` | ✅ doctor ready |
| 自建风格库 | `~/Documents/Codex/Codex-skills-hub/local-style-libraries/cove` | ✅ 3 条，索引已建 |
| agents/openai.yaml | 技能目录下 `agents/` | ✅ 已补 |
| ACE-Step 环境 | `~/Documents/Codex/Codex-skills-hub/tools/ace-step-env` | ✅ acestep + torch 2.15 + MPS |
| ACE-Step 包装脚本 | `~/Documents/Codex/Codex-skills-hub/tools/acestep_gen.py` | ✅ 已按契约写好，未实跑 |
| 模型权重 | `~/Documents/Codex/Codex-skills-hub/tools/models/ACE-Step-v1-3.5B` | ✅ 8.1G 完整下载 |
| 冒烟测试 | `tools/probe/out/seed101.wav` | ✅ 8s 音频，48kHz 立体声，114s 生成 |
| 四案音乐候选 | `tools/music/out-{A,B,C,D}` → 已复制到 `showcase/out/music/` | ✅ 各 64s，约 3 分钟一首 |

续传命令：

```sh
cd ~/Documents/Codex/Codex-skills-hub/tools/models/ACE-Step-v1-3.5B
for f in ace_step_transformer/diffusion_pytorch_model.safetensors umt5-base/model.safetensors \
         music_dcae_f8c8/diffusion_pytorch_model.safetensors music_vocoder/diffusion_pytorch_model.safetensors; do
  curl -sL --retry 3 -C - -o "$f" "https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B/resolve/main/$f" &
done; wait
```

冒烟测试（8 秒器乐）：

```sh
cd ~/Documents/Codex/Codex-skills-hub/tools
ace-step-env/bin/python acestep_gen.py probe/spec-smoke.json probe/out
```

## 未做（需明确授权）

- [x] `remotion render` 出成片：`showcase/out/cove-showcase.mp4`（64 秒 / 1080×1440 / 30fps / yuv420p / 含静音音轨 / 3.5 MB）
- [x] 音乐生成：四案已出；作者选定 **A**，已归一化并合入成片
- [x] 返修 P1：R04 气势词 / R06 接缝 / R07 结尾光晕
- [x] 返修 P2：R01 音效（7 个自制）/ R02 持续运动 / R05 背景材质
- [x] 作者审片反馈 R10–R17 全部修复：标记裸露、取景被裁、闪烁、音效改 CC0 素材、去音乐、白帧
- [x] 交付流程改为「PNG 序列 → 逐帧校验 → 编码」
- [ ] 作者复审后转 verified
- [ ] 封面 / 图文素材导出
- [ ] 45 秒精简版

## 交接要点

1. 读 `BRIEF.md` → `DECISIONS.md` → `card/任务卡.md`
2. 时间轴以 `card/task.json` 为准
3. 起展示实例：
   ```sh
   node showcase/scripts/build-demo-fixture.mjs
   node showcase/scripts/seed-demo.mjs
   COVE_DATA_DIR=$PWD/showcase/.demo-data COVE_DB_PATH=$PWD/showcase/.demo-data/cove.sqlite \
   COVE_FIXTURE_PATH=$PWD/showcase/fixtures/items.json COVE_SECRET_STORE=memory \
   COVE_AUTO_SYNC=0 COVE_PORT=4400 COVE_STATIC_DIR=$PWD/webapp/dist node local-service/dist/index.js
   ```
4. 重新截图：`node showcase/scripts/capture.mjs`（需要实例在 4400 跑着）
5. 重渲静帧：`cd showcase && fnm exec --using=22 -- npx remotion still src/index.ts CoveShowcase out/S0X.png --frame=N --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
