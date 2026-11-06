# 四案音乐方案

项目/文案版本：COVE-SHOWCASE-01 v3（64 秒，1080×1440，30fps）
阶段：`card`
声音身份与已有作者决定：无克隆声线；无口播；字幕烧屏
画风：Cove 设计系统（克制、明亮、无水花）
预计总长：64 秒（精简版：删 S02 与 S07 → 51 秒）
口播区间：无
本次是否已授权生成：**否**。本文件只写方案，不生成音频，不声称已卡点。

## 全片结构

| 段落 | 要表达的变化 | 画面事件/阅读窗 | 预计秒区间 | 能量/密度/留白 | 声音层分工 |
|---|---|---|---|---|---|
| S01 | 一行藏在正文里的要求 | E_LINE_SPOT 1.0 / E_PULL_BACK 2.4 | 0–6 | 能量 1，密度 1，留白大 | 低频垫 + 一次极轻提示 |
| S02 | 三处说法其实是一个日期，还有几十条 | E_CLAIMS_SYNC 8.2 / E_COUNT_START 10.6 | 6–12 | 能量 3，密度 3 | 加入轻脉冲，纸片音效 |
| S03 | 它变成了一张卡 | E_LINE_LIFT 12.6 / E_CARD_LAND 14.8 | 12–19 | 能量 3，密度 2 | 旋律第一次出现完整动机 |
| S04 | 真同步，几十条合成一份 | E_SYNC_PRESS 19.8 / E_SYNC_DONE 21.4 | 19–26 | 能量 5，密度 4 | 全曲唯一的高点 |
| S05 | 点开就是原文 | E_DRAWER_OPEN 28.6 / E_MARK_PRESS 34.8 | 26–38 | 能量 4 → 2，密度降 | 退到最简，只留持续音 |
| S06 | 从看完了到清空了 | E_MARK_SEEN 43.5 / E_ZERO 45.0 | 38–48 | 能量 4 → 2 | 一次下行收束 |
| S07 | 签到分支 | E_FILL_PRESS 50.4 | 48–54 | 能量 3，密度 2 | 一次短促的接触音，其余留白 |
| S08 | 不替你决定 | E_VALUE_1/2/3 | 54–60 | 能量 1，密度 1 | 几乎只剩尾音 |
| S09 | 落款 | E_LOGO 60.0 | 60–64 | 能量 1 | 终止式，尾音覆盖到 64 秒后 |

**共同约束**：不使用鼓组、不用 riser/impact 类预告音效、不用 whoosh。产品片的音乐只负责"填住空白"，任何一处盖过字幕即为错误。

## 四案差异

| 维度 | A 纸与窗 | B 整理 | C 雨停 | D 轻机械 |
|---|---|---|---|---|
| 编制/音色 | 毛毡钢琴 + 房间底噪 | 模拟合成器 pad + 磁带嘶声 | 大提琴 + 弱音钢琴 | 预置钢琴 + 木质打击 |
| 速度/拍号/自由时间 | 无固定拍（rubato），以气口为界 | 4/4，72 BPM，脉冲存在但不打鼓 | 3/4，60 BPM，长弓主导 | 4/4，96 BPM，机械匀速 |
| 动机 | 三个音的级进，S04 升高半音 | 两个音的下降，反复 | 一条长的弓弦线，几乎不变 | 一个"哒"的重复，间隔递减 |
| 能量曲线 | 缓慢上行，S04 后才释放 | 由薄到厚，S05 突然抽薄 | 全程平稳，只有一次呼吸 | 前段稳，S04 出现唯一一次加密 |
| 与字幕的关系 | 完全让位，字幕出现时只剩单音 | 让位，S05 撤掉 pad 只留嘶声 | 让位最好，长音不抢字 | 需要最小心，节奏感最容易撞字幕 |
| 结尾方式 | 悬置和弦，不收 | 低通滤波合上，渐隐 | 一个持续音自然衰减 | 最后一"哒"后完全静默 |

四案在编制、节奏结构、动机、能量曲线、结尾方式上均有实质差异，不是同一提示词的四个 seed。

## 单案 A · 纸与窗

- 表达意图：安静的发现感，像翻到一页被折角的纸
- 为什么适合本文：S01 是全片最静的一段，需要"一个人在自己的桌边"的质地
- 取舍：没有节拍，S02 的计数段会显得不齐；靠音效承担节奏
- 编配：毛毡钢琴为主，极轻的踏板噪声保留
- 节奏：rubato，S02 起加一条极轻的左手分解
- 动机：C–D–E 三音级进，S04 升到 C♯–D♯–F
- 口播让位：无口播，但字幕期间只留单音
- 结尾：悬置和弦停住，不收束

完整英文 caption：
> Instrumental, quiet and observant, like turning to a page someone folded for you. Solo felt piano with preserved pedal and room noise, no drums and no bass. Free rubato with no fixed meter; a three-note rising motif (C–D–E) that shifts up a semitone exactly once at the midpoint and never returns. Opening is a single sustained note over room tone; a sparse left-hand arpeggio enters partway through; one brief moment of fuller voicing at the centre; then the texture thins back to a single line and an unresolved suspended chord. Leave generous empty space for burned-in Chinese subtitles. Ending hangs, does not resolve. Avoid percussion, risers, whooshes and any swelling crescendo.

SPEC 草稿（结构示意，不是已定参数）：
```json
{"caption":"REPLACE_WITH_CAPTION_A","duration":58,"bpm":0,"keyscale":"C major","timesignature":"4","seeds":[101],"thinking":true,"steps":8,"shift":3.0,"offload":false}
```

## 单案 B · 整理

- 表达意图：把散的东西收进同一格抽屉的手感
- 为什么适合本文：与"合并、归类"的产品动作同构
- 取舍：合成器 pad 容易显得"科技感太强"，需要靠磁带嘶声压住
- 编配：两层模拟 pad（低/中），磁带嘶声贯穿
- 节奏：72 BPM 4/4，只有极轻的脉冲，不打鼓
- 动机：G–F 两音下降，每 8 小节重复一次，音色逐次变暗
- 口播让位：S05 抽屉段撤掉中层 pad，只留嘶声
- 结尾：低通滤波器在 4 秒内合上

完整英文 caption：
> Instrumental, warm and methodical, the feeling of sorting loose papers into one drawer. Two layers of analog synthesizer pad, low and mid, with continuous tape hiss and gentle wow and flutter; no drums, no bass line. Steady pulse at 72 BPM in 4/4, but the pulse is felt rather than played by percussion. A two-note descending motif (G–F) recurs every eight bars, its timbre darkening each time. Opens thin and close; thickens as the middle section arrives; suddenly strips back to hiss alone during the quietest passage; then closes with a slow low-pass filter sweep. Keep the midrange clear for burned-in Chinese subtitles. Avoid arpeggiated synth leads, sidechain pumping and any cinematic build.

SPEC 草稿：
```json
{"caption":"REPLACE_WITH_CAPTION_B","duration":58,"bpm":72,"keyscale":"G minor","timesignature":"4","seeds":[202],"thinking":true,"steps":8,"shift":3.0,"offload":false}
```

## 单案 C · 雨停

- 表达意图：事后松了一口气，不是当场兴奋
- 为什么适合本文：观众看完的情绪落点是"终于不用再翻了"，不是"好厉害"
- 取舍：情绪偏重，可能压住前半段的轻快
- 编配：大提琴长弓 + 弱音钢琴点状音
- 节奏：60 BPM 3/4，弦乐基本不按拍
- 动机：一条几乎不变的弓弦线，只在 S04 处做一次换弓
- 口播让位：长音天然让位，是四案里最安全的
- 结尾：一个持续音自然衰减，不剪

完整英文 caption：
> Instrumental, calm and slightly relieved, the feeling after a long rain stops. Cello long bows as the main voice, with sparse muted piano points underneath; no drums, no electronics. Slow 3/4 at 60 BPM, but the cello phrases ignore the beat and breathe on their own. One sustained bowed line carries almost the whole piece, changing bow direction only once at the centre. Opens with the cello alone; muted piano enters sparsely; the middle swells slightly without percussion; then everything recedes to a single held note. Leave the foreground empty for burned-in Chinese subtitles. Ending is a natural decay, never cut or faded abruptly. Avoid vibrato-heavy romantic playing, timpani and any triumphant resolution.

SPEC 草稿：
```json
{"caption":"REPLACE_WITH_CAPTION_C","duration":58,"bpm":60,"keyscale":"D minor","timesignature":"3","seeds":[303],"thinking":true,"steps":8,"shift":3.0,"offload":false}
```

## 单案 D · 轻机械

- 表达意图：工具感，像一台安静运转的小机器
- 为什么适合本文：全片有大量点击与列表变化，机械的节奏语法与画面同源
- 取舍：最容易撞字幕，需要极小的音量与极大的间隔控制
- 编配：预置钢琴（弦上夹物）+ 木质敲击
- 节奏：96 BPM 4/4，脉冲明确但不连续
- 动机：一个"哒"的重复，间隔逐渐缩短，S04 后恢复
- 口播让位：S05 起把敲击降到几乎听不见
- 结尾：最后一"哒"之后完全静默

完整英文 caption：
> Instrumental, precise and quietly mechanical, the sound of a small tool running well. Prepared piano with objects on the strings as the main texture, plus dry wooden percussion hits; no drums kit, no bass, no synthesizers. Steady 96 BPM in 4/4 with an explicit but intermittent pulse. The motif is a single wooden tick that repeats with gradually shortening gaps, then resets to wide spacing after the middle. Opens with one tick and silence; texture accumulates; the middle is the only denser passage; then the ticking thins until a final single tick and complete silence. Keep the midrange free for burned-in Chinese subtitles. Avoid glitch effects, stutter edits, EDM percussion and any riser.

SPEC 草稿：
```json
{"caption":"REPLACE_WITH_CAPTION_D","duration":58,"bpm":96,"keyscale":"A minor","timesignature":"4","seeds":[404],"thinking":true,"steps":8,"shift":3.0,"offload":false}
```

## 音效表

| 事件id | 对象/材质/力度 | 文件与许可 | 接触秒/基准 | peakOffset秒与证据 | 播放开始秒 | gain/轮换/密度 |
|---|---|---|---|---|---|---|
| E_SYNC_PRESS | 机械按键 / 中 | 待选（需 CC0 或已授权） | 19.8 planned | **未测** | 19.8 − peakOffset | −18 dBFS 起，全片同一文件 |
| E_OPEN_PRESS | 机械按键 / 中 | 同上（复用） | 27.0 planned | **未测** | 同上 | 同上 |
| E_MARK_PRESS | 机械按键 / 中 | 同上（复用） | 34.8 planned | **未测** | 同上 | 同上 |
| E_MARK_SEEN | 机械按键 / 中低 | 同上，低一档 | 43.5 planned | **未测** | 同上 | −20 dBFS |
| E_DRAWER_OPEN | 布面滑动 / 中低 | 待选 | 28.6 planned | **未测** | 28.6 | 520ms 材料，不裁头 |
| E_CLOSE_PRESS | 布面滑动（逆向）/ 中低 | 同文件反向播放 | 33.0 planned | **未测** | 33.0 | 420ms |
| E_CLAIMS_SYNC | 纸质叠合 / 中 | 待选 | 8.2 planned | **未测** | 8.2 | 单次 |
| E_CARD_LAND | 纸质落定 / 中低 | 待选 | 14.8 planned | **未测** | 14.8 | 单次 |
| E_ZERO | 柔和下行合成 / 低 | 待选 | 45.0 planned | **未测** | 45.0 | 700ms，−22 dBFS |

规则：同一材质的点击音效全片共用一个文件；连续出现间隔小于 0.3 秒时做增益递减，避免机械重复。

## 试听与选定记录

### 2026-11-03 本机生成（ACE-Step 1.5 / MPS / float32）

| 案 | 文件 | SHA-256 | 生成耗时 | 时长 | 平均响度 |
|---|---|---|---|---|---|
| A | `~/Documents/Codex/Codex-skills-hub/tools/music/out-A/seed101.wav` | `b16adf2f610080b9…` | 191.0s | 64.0s | 见下 |
| B | `~/Documents/Codex/Codex-skills-hub/tools/music/out-B/seed202.wav` | `102fe01a2a033a8a…` | 152.9s | 64.0s | 见下 |
| C | `~/Documents/Codex/Codex-skills-hub/tools/music/out-C/seed303.wav` | `06d646ea8b5bc3e5…` | 136.4s | 64.0s | 见下 |
| D | `~/Documents/Codex/Codex-skills-hub/tools/music/out-D/seed404.wav` | `20f27ee3aa23e8c5…` | 170.0s | 64.0s | 见下 |

- 生成环境：`~/Documents/Codex/Codex-skills-hub/tools/ace-step-env`（torch 2.15 + MPS），包装脚本 `acestep_gen.py`
- 实际参数：guidance_scale 1.0、8 steps、单 seed、器乐、48kHz 立体声
### 后续变更（2026-11-03 晚）

作者反馈 A 案"嘈杂、不清晰、不好听、偏激昂"。改用**自制环境垫**：

- 文件：`showcase/public/music/bed-quiet.wav`（64s，四段和弦 Am–F–C–G，低通噪声空气层，无节奏、无鼓）
- 混音：`-10 dB`，最终整片 -27.95 LUFS / TP -5.07 dB
- 说明：这是合成垫音，不是 ACE-Step 产物；ACE-Step 的四案保留在 `tools/music/out-*/` 供以后对比

### 选定结果（2026-11-03）

作者选定：**A 纸与窗**。

- 实测：192kHz 源，-23.52 LUFS，真峰值 -6.14 dB，LRA 11.2
- 处理：重采样 48kHz → loudnorm 到 -16 LUFS / TP -1.5 → 淡入 1.2s、淡出 2.8s，取满 64 秒
- 成片实测：**-16.22 LUFS，真峰值 -1.40 dB**（达标）
- 合入：`showcase/out/cove-showcase.mp4`（7.7 MB，视频流直通未二次编码）

### 关于吸附

A 案是自由速度、无固定拍（caption 明确写了 free rubato / no fixed meter），**没有拍点可吸附**，因此不建立 BPM 网格，也不伪造卡点。

改为验证"音乐不抢字幕"：实测各事件点前后 1 秒的能量变化

| 事件 | 时间 | 能量 | 前后差 |
|---|---|---|---|
| E_CLAIMS_SYNC | 8.2s | -15.4 dB | +0.5 dB |
| E_CARD_LAND | 14.8s | -14.2 dB | -2.2 dB |
| E_TOGGLE_ACTION | 21.4s | -15.7 dB | -2.1 dB |
| E_DRAWER_OPEN | 28.6s | -11.2 dB | +1.7 dB |
| E_FILL_PRESS | 50.4s | -19.6 dB | +2.2 dB |
| E_LOGO | 60.0s | -15.9 dB | -2.3 dB |

全部在 ±2.3 dB 内（E_LINE_SPOT 的 +6.2 dB 是开场淡入本身），无突变、无撞字。

### 原始记录位置



比较办法：四案各渲染一版仅含声音的 64 秒静帧底片（黑底 + 字幕），静音对比与带声对比各一遍。
作者选择日期、原话与具体文件：**未选**
文件 hash / 采样率 / 声道 / 采样数 / 实际时长：**无**
生成配置与实际 thinking_used：**未生成**
实测乐句/强拍/词锚列表位置：**未测**
需要改动与失效事件：选定音轨后，E_CLAIMS_SYNC、E_SYNC_DONE、E_LINE_SPOT 三个 allow_snap 事件需按实测拍点重排
编码后响度/真峰值/同步检查：**未执行**
