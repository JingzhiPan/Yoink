# YOINK

Turn a UI interaction demo video into three things: a verified spec, a runnable and tweakable demo, and a Claude Code skill. Everything runs locally; the library is just a folder.

Built for two kinds of people:
- **Front-end developers**: see an effect in someone's video, drop it in, and a few minutes later have a demo you can edit and a skill Claude Code can reuse.
- **Designers**: recreation is only the starting point. Demos have draggable parameters, branchable variants and a one-page handoff, so you can keep developing after the recreation lands.

![Library](docs/library.jpg)

![Workspace](docs/workspace.jpg)

## Run

```bash
brew install ffmpeg        # frame extraction, video compression
npm install
npm start                  # vite + Electron dev mode
```

You need **Claude Code** installed and logged in (the `claude` command). Verification, material analysis, demo generation, demo edits, spec consolidation and skill packaging all run through `claude -p` locally; no separate Anthropic key.

Three ways to turn the video into a spec, chosen the first time you drop one in:
- **Computer Use**: Claude Code drives Chrome and uses your logged-in ChatGPT tab to watch the video and write the spec. The video is compressed under 10MB first.
- **API**: enter an OpenAI key once; key frames go to a vision model.
- **Manual**: give the video to any model that can watch video and paste the text back.

Dropping a video on the Dock icon works too.

## Pipeline

1. **Drop a video** → ffmpeg extracts key frames (scene detection; evenly spaced by duration when the motion is too smooth).
2. **Raw spec** → one of the three methods above. The prompt asks for motion rather than numbers, plus a "core principle" and a per-second timeline, because the model that verifies later only sees stills.
3. **Cross-check** → Claude reads every frame: deletes hallucinations, adds what was missed, fixes the technical approach. Core principle and timeline are kept verbatim.
4. **Material pass + judgment list** (runs right after the check) → you box the subject; Claude reads zoomed crops and breaks the surface into layers (shape, position, softness, falloff, opacity, blend mode) into the spec. It also lists what it cannot settle from stills: aesthetic intent, shapes, mechanism A vs B, pixel ownership. You pick an answer or write your own.
5. **Generate demo** → a self-contained `demo/index.html`, 960×600, exposing `window.__yoink.states` (one function per state, used for screenshots). Answered judgments are followed; unanswered ones use the first option and leave a switch.
6. **Tune the demo**
   - Type feedback like "the animation is too fast". To argue with pixels, click "box the original": drag a region on a frame and it is attached zoomed in; Claude compares layer by layer before editing.
   - **Tweaks**: tunables are CSS variables in `<style id="yoink-tweaks">`, shown as a column of live sliders that write back to the file. Tell it what you want to tune before extracting. Shape parameters are `points` type, dragged as handles directly on the demo. Hide the ones you don't care about.
   - **Variants**: save the current demo as a variant, each its own workspace (own feedback log and tweaks), or fork into a new pattern. An orange fish swims on whichever sidebar row Claude is working on.
7. **Confirm demo** → every state is screenshotted and paired with its original frame by Claude; then the spec is consolidated in two steps: first a diff (overturned / newly discovered / user decisions), then a full rewrite driven by that diff, with user decisions in their own section. An existing skill is repacked automatically.
8. **Handoff page** → assembled from the spec, judgment answers and the tweaks manifest: what the video proves / what the user decided / still open / craft details / tunables. Written to `handoff.md` and bundled into the skill.
9. **Skill** → `skill/` (SKILL.md + component/ + spec.md + handoff.md + screenshots/).

Tags are fixed to five facets, at most one each: what it is / look / UX direction / feels like / used for. Tech terms go to tech_hints.

## Library

Defaults to `~/yoink/<slug>/`; override with `YOINK_LIBRARY`. One folder per pattern:

```
source.mp4            original video     demo/index.html       demo
frames/               key frames         demo-screenshots/     one shot per state
material/             zoomed crops       demo-compare.md/json  compare report + pairs
raw-spec.md           raw spec           demo-feedback.md      feedback log
spec.md               current spec       variants/<slug>/      variants (own index.html + feedback.md)
spec-verified.md      long pre-consolidation version   judgment.json   judgment list + answers
consolidate-diff.md   consolidation diff handoff.md            handoff page
skill/                skill              cover.png / meta.json cover, metadata
```

## Connect to Claude Code

```bash
claude mcp add --scope user yoink -- node "$(pwd)/mcp/server.mjs"
```

Run from the project root. Exposes 6 tools: `search_patterns`, `get_spec`, `get_frames`, `get_demo_screenshots`, `get_handoff`, `get_skill`. Pure filesystem, no network, no auth. Have Claude Code search the library before implementing an effect; on a hit, read the handoff and the skill.

## Layout

```
electron/         main process: IPC, pipeline steps, yoink:// protocol (with the tweaks bridge)
electron/lib/     ffmpeg / claude CLI / prompts / library IO / screenshots / cover cropping
src/              React UI
shared/types.ts   types shared by both sides
mcp/server.mjs    MCP server
scripts/          dev Electron shell (own bundle id and icon, accepts Dock drops)
build/            icons
docs/             screenshots, early UI mockup
```

<details>
<summary><b>中文说明</b></summary>

把 UI 交互演示视频变成三样东西：一份核对过的 spec、一个能跑能调的 demo、一个 Claude Code skill。全部在本地，素材库就是一个文件夹。

给两种人用：
- **自己写前端的**：看到别人视频里的效果，拖进来，几分钟后拿到能直接改的 demo 和给 Claude Code 用的 skill。
- **设计师**：复刻只是起点。demo 上有可拖的参数、可分支的方案、一页交接文档，复刻完可以接着自己往下做。

### 跑起来

```bash
brew install ffmpeg        # 抽帧、压视频
npm install
npm start                  # vite + Electron 开发模式
```

需要装好并登录 **Claude Code**（`claude` 命令）。核对、拆材质、生成 demo、改 demo、精简 spec、打包 skill 全部通过 `claude -p` 在本地跑，不用另填 Anthropic key。

视频解析有三种方式，首次拖视频时选：
- **Computer Use**：Claude Code 带 Chrome 扩展，用你已登录的 ChatGPT 网页看视频写 spec。视频会先压到 10MB 以内。
- **API**：填一次 OpenAI key，关键帧发给视觉模型。
- **手动**：自己把视频丢给任何能看视频的模型，把文字粘回来。

Dock 图标上直接丢视频也行。

### 流程

1. **拖视频** → ffmpeg 抽关键帧（场景检测，太平滑则按时长均匀抽）。
2. **原始 spec** → 上面三种方式之一。prompt 要求描述运动而不是数值，并写出"设计意图"和按秒的时序，因为后面核对的模型只能看静止帧。
3. **交叉核对** → Claude 逐帧看图：删脑补、补漏项、修技术方案。设计意图和时序两节原样保留。
4. **材质拆解 + 待判定**（核对完自动接上）→ 你框出主体，Claude 看放大图把表面拆成一层层（形状、位置、软硬、衰减方向、浓淡、叠加方式），写进 spec；同时列出它从静止图判断不了的问题：审美意图、形状、机制二选一、像素归属。你在清单里选答案或自己写。
5. **生成 demo** → 自包含的 `demo/index.html`，960×600，定义 `window.__yoink.states`（每个状态一个函数，用来截图）。你判定过的按决定做，没判定的按第一候选做并留开关。
6. **调 demo**
   - 反馈框直接说"动画太快了"。想指着像素说话就点"框原图对照"，在原始帧上框一块放大附上，Claude 先逐层对比再改。
   - **Tweaks**：demo 里的可调参数是 `<style id="yoink-tweaks">` 里的 CSS 变量，右侧一列滑块实时改、写回文件。抽取时先说你想调什么。形状类参数是 `points` 类型，在 demo 上直接拖角点。不要的参数藏掉。
   - **方案**：另存当前 demo 为方案，每个方案是独立工作区（自己的反馈记录和 tweaks），或者直接分支成新 pattern。侧栏里哪一行有 Claude 在干活，就有条橙色小鱼在游。
7. **确认 demo** → 自动截每个状态、让 Claude 把截图和原始帧配对比对；然后精简 spec：先出一份 diff（被推翻的 / 新发现的 / 用户决定的），再按 diff 重写全文，用户决定单独成节。已有 skill 会自动重打。
8. **交接页** → 从 spec、判定答案、tweaks 清单自动拼出：视频能证明的 / 用户决定的 / 仍未定 / 手感细节 / 可调参数。落盘 `handoff.md`，skill 里带一份。
9. **Skill** → `skill/`（SKILL.md + component/ + spec.md + handoff.md + screenshots/）。

标签固定五个维度，每个最多一个：是什么 / 审美 / UX 方向 / 像什么 / 干嘛用。技术词进 tech_hints。

### 素材库

默认在 `~/yoink/<slug>/`，环境变量 `YOINK_LIBRARY` 可改。每个 pattern 一个文件夹，结构见上面英文部分的目录表。

### 接到 Claude Code

```bash
claude mcp add --scope user yoink -- node "$(pwd)/mcp/server.mjs"
```

在项目根目录跑。暴露 6 个 tool：`search_patterns`、`get_spec`、`get_frames`、`get_demo_screenshots`、`get_handoff`、`get_skill`。纯文件系统，无网络无鉴权。让 Claude Code 在实现效果前先搜一下库，命中就读 handoff 和 skill。

</details>
