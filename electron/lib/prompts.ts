import type { PatternMeta } from '../../shared/types.js';

export const SPEC_FORMAT_HINT = `统一 spec 格式（Markdown）：
# <Pattern name in English>
## Overview — 一段话讲这个效果是什么、给人什么感觉
## Core Principle — 设计意图。像一个懂工程的设计师给 coding agent 讲：所有表现背后的那一条生成规则是什么（例如"距离决定两个实体之间是否长出液桥"），它应该被抽象成什么可复用的 primitive（组件/参数/状态），做对了"手感"是什么、做错了会露馅在哪。这是这个效果的灵魂，别写成现象罗列。
## Timeline — 按秒的事件序列（0.0s 初始态 → 0.4s 点击 → …），只写视频里真发生的
## Visual States — 列出所有可见状态（initial / hover / active / open / closing …），每个状态描述布局、颜色、形状、尺寸关系
## Interactions & Timing — 每个交互：触发条件 → 变化 → 时长/缓动/弹簧参数（能估就估，给数值）
## Technical Approach — 推荐实现方式（CSS / SVG filter / canvas / 动画库），关键技术点逐条说明
## Tags — 逗号分隔的英文标签
（Core Principle 和 Timeline 靠看视频才写得出，帧核对时保留原文不删）`;

export function verifyPrompt(meta: PatternMeta, rawSpec: string, frames: string[]): string {
  return `你是 UI 交互效果的技术审阅者。有一段 UI 演示视频，已抽出 ${frames.length} 张关键帧（按时间顺序），另有一份由其他模型（可能是 GPT）看视频写出的原始 spec。你的任务是"交叉核对"：用 Read 工具逐张查看帧图，然后逐条校验原始 spec。

核对规则：
1. 原始 spec 里描述了帧里完全看不到、也无法从帧序列合理推断的东西 → 删掉，并在末尾"Verification Notes"里记一条。
2. 帧里明显存在但 spec 漏了的状态/交互 → 补上。
3. 技术方案描述含糊或和画面不符（比如画面明显是 SVG 滤镜融合效果却写成了 CSS transition）→ 根据帧修正。
4. 保留原 spec 中合理的时间/缓动估计；帧序列能佐证的加以确认，不能佐证的标注"(估计)"。
5. 不要凭空脑补新功能。拿不准就写"帧中不可判断"。
6. 原始 spec 的 "Core Principle" 和 "Timeline" 两节是看完整视频才写得出的设计意图和时序，帧无法核对；原样保留（可以修错字，不要删减、不要改判）。如果原始 spec 没有这两节，就根据你从帧里理解到的写一版，并标注"(由帧推断)"。

关键帧路径（请全部 Read）：
${frames.map((f, i) => `${i + 1}. ${f}`).join('\n')}

原始 spec：
<<<RAW_SPEC
${rawSpec}
RAW_SPEC

${SPEC_FORMAT_HINT}
在 Tags 之后追加一节：
## Verification Notes — 你删了什么、补了什么、修正了什么（简短列表）

输出要求：先输出完整的 verified spec Markdown（用 \`\`\`markdown 围栏包裹），然后输出一个 \`\`\`json 围栏的元数据块：
{"name": "英文名", "tags": ["..."], "category": "micro-interaction|transition|layout|data-viz|navigation|form|feedback|creative", "complexity": "low|medium|high", "tech_hints": ["..."]}
complexity：low=纯 CSS，medium=需要 JS/动画库，high=需要 canvas/SVG/WebGL/自定义渲染。
当前 meta 供参考：${JSON.stringify({ name: meta.name, tags: meta.tags, category: meta.category })}`;
}

export const DEMO_CONVENTION = `demo 约定（必须遵守）：
- 只写一个自包含的 demo/index.html（内联 CSS/JS；如需库，只能从 https://cdnjs.cloudflare.com 或 https://cdn.jsdelivr.net 加载 UMD 构建）。
- 页面尺寸固定 960×600，body 无 margin，背景色显式设置，效果居中展示。
- 在 index.html 里定义 window.__yoink = { states: { "initial": async () => {}, "<state-name>": async () => { /* 用代码把页面推进到该状态，比如派发 click/hover 事件 */ } } }。
  状态名用 kebab-case，顺序按交互流程；每个 state 函数执行后页面应静止在该状态（等待动画结束后再 resolve）。至少 2 个状态，最多 6 个。
- 不要依赖真实鼠标位置：hover 类状态用添加 class 或派发 pointer 事件模拟。
- 不要用 alert/console 噪音。
- Tweaks 约定：把最值得调的参数（时长、缓动/弹簧、颜色、尺寸、阈值，6–14 个）写成 :root 上的 CSS 变量，放在 <style id="yoink-tweaks">:root{ --x: 300ms; ... }</style> 这个独立 style 块里（只放变量，一行一个）。JS 里需要这些数值时用
  const tweak = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  在每次用到时现读（不要启动时缓存），这样外部改变量能实时生效。再声明清单：
  window.__yoink.tweaks = [{ key: "--x", label: "展开时长", type: "range", min: 100, max: 1200, step: 10, unit: "ms" }, { key: "--accent", label: "主色", type: "color" }, ...]
  type 只有 range / color / text；range 的值写成 数字+unit（unit 可为空）。`;

export function demoPrompt(spec: string, frames: string[]): string {
  return `根据下面这份经过验证的 UI 交互 spec，在当前目录写出一个可运行的 working demo。先用 Read 看关键帧（原始视频抽出来的）以对齐视觉细节，再写代码。

关键帧：
${frames.map((f) => `- ${f}`).join('\n')}

${DEMO_CONVENTION}

用 Write 工具写文件到 demo/index.html（相对当前目录）。写完后简短总结你实现了哪些状态。

spec：
<<<SPEC
${spec}
SPEC`;
}

export function feedbackPrompt(feedback: string, history: string, spec: string): string {
  return `当前目录下 demo/index.html 是根据 spec 生成的 UI 交互 demo。用户看过效果后给出反馈，请用 Read 读取 demo/index.html，按反馈用 Edit 修改（保持 window.__yoink.states 约定不变，如需可增删状态）。改完一句话说明改了什么。

用户这次的反馈：
${feedback}

之前的反馈记录（供参考，已处理）：
${history || '（无）'}

${DEMO_CONVENTION}

spec 摘要：
${spec.slice(0, 3000)}`;
}

export function comparePrompt(frames: string[], shots: string[]): string {
  return `请用 Read 工具查看两组图片，然后对比：第一组是原始 UI 演示视频的关键帧，第二组是根据 spec 生成的 demo 的运行截图。

原始帧：
${frames.map((f) => `- ${f}`).join('\n')}

demo 截图：
${shots.map((f) => `- ${f}`).join('\n')}

先做配对：每张 demo 截图对应原始视频里的哪一个状态？从原始帧里挑出最接近那个状态的一张（同一阶段、同一交互时刻）。原始帧里大量是过渡帧和重复帧，配不上的直接丢掉，不要硬凑；一张 demo 截图找不到对应状态就 frame 填 null。

输出两部分：

第一部分，简短的 Markdown 对比报告（中文）：
## 匹配良好
- ...
## 差异较大（需要修）
- 每条写：哪个截图 vs 哪张原始帧 → 差在哪（颜色/形状/布局/动画阶段/缺失状态）→ 建议怎么改
## 无法比对
- demo 截图覆盖不到的原始状态（如中间动画帧）

第二部分，最后单独一个 \`\`\`json 围栏，给程序读，格式严格如下（文件名只写 basename）：
\`\`\`json
{"pairs":[{"shot":"state-hover.png","frame":"frame-007.png","note":"一句话说差异，没差异写 ok"}]}
\`\`\`
pairs 按 demo 截图顺序，每张截图恰好一条。

只输出这两部分，不要客套。`;
}

export function skillPrompt(meta: PatternMeta, spec: string, shots: string[]): string {
  return `把当前目录下这个已确认的 UI 交互 demo 打包成一个 Claude Code skill。

已有内容：
- demo/index.html：可运行 demo（用 Read 读取）
- spec.md：验证过的 spec
- demo 截图：${shots.map((s) => path_basename(s)).join(', ') || '（无）'}
- meta：${JSON.stringify({ id: meta.id, name: meta.name, tags: meta.tags, category: meta.category, complexity: meta.complexity, tech_hints: meta.tech_hints })}

请用 Write 工具生成：
1. skill/SKILL.md —— 顶部 YAML frontmatter：
   ---
   name: ${meta.id}
   description: <一句话：这个效果是什么 + 什么时候该用它。Claude Code 会靠这句话决定何时触发，所以要写具体的触发场景和同义说法，例如"当用户想要按钮/元素之间黏连融合的液态效果、gooey、metaball 效果时使用">
   ---
   正文（英文或中英混合均可）：效果说明、何时使用、如何把 component/ 里的代码嵌入到 React/纯 HTML 项目、关键参数怎么调（时长、颜色、弹簧参数）、注意事项（性能、浏览器兼容）。
2. skill/component/ —— 可复用的代码。把 demo 里的核心效果抽成独立文件：至少一个纯 HTML/CSS/JS 版本（standalone.html）；若 spec 的技术方案是 React，再给一个 Component.tsx。去掉 window.__yoink 这类 demo 专用脚手架。
3. skill/spec.md —— 直接复制 spec.md 内容。

最后一句话总结生成了哪些文件。

spec：
<<<SPEC
${spec}
SPEC`;
}

function path_basename(p: string) { return p.split('/').pop() ?? p; }

export const VIDEO_PROMPT = `Watch this UI interaction demo video carefully and write an implementation spec for a front-end engineer.

Rules:
- Describe MOTION, not numbers. Do not list value sequences or frame-by-frame readings; say what moves, in which direction, how fast it feels (instant / snappy / eased / springy), and what triggers it.
- Describe every ELEMENT you can see and how each one behaves over time.
- Then list BOUNDARY MOMENTS explicitly, one bullet each: what happens when two elements meet or overlap, when a value reaches its minimum or maximum, when something appears from nothing or disappears completely, when the pointer enters/leaves/presses. These moments are where the craft is; do not skip them even if they last a fraction of a second.
- Only describe what is visible. If you are unsure, say "unclear from video".
- In "Core Principle", think like a designer who can code: name the single rule that generates every behavior in the video, the reusable primitive it should become (component + its parameters), and what the feel is — the thing a coding agent would get wrong if it only copied the surface. This section is the soul of the spec; do not skip it or reduce it to a summary.
- In "Timeline", list real events with approximate timestamps, since you can see the video and later reviewers only see stills.

Structure it exactly as:
${SPEC_FORMAT_HINT}
In "Interactions & Timing", split into two sub-lists: **Motion** and **Boundary moments**.`;

export function computerUsePrompt(videoPath: string, durationSec: number): string {
  return `你有 Claude in Chrome 浏览器工具。任务：用用户已登录的 ChatGPT 网页，让它看一段 UI 交互演示视频并写出实现 spec，然后把 ChatGPT 的完整回答原样带回来。

步骤：
1. 用 tabs_create 新开标签页，navigate 到 https://chatgpt.com/ ，然后 wait 5 秒再截图。登录判定要严格：只有同时满足「页面上没有聊天输入框（"Ask anything" 之类）」且「有明显的 Log in / Sign up 按钮」才算没登录；如果只是页面还在加载、有 Cloudflare 验证页、或弹了个可关闭的提示框，就再等 3 秒、关掉提示框、重新截图判断，最多重试 2 次。确认没登录才停止并只回复一行 "NOT_LOGGED_IN"；已登录就直接继续，不要因为侧栏或页脚出现 "log in" 字样就误判。
2. 找到输入框旁的附件/上传按钮，用 file_upload 工具上传本地文件：${videoPath}
   （视频 ${durationSec.toFixed(1)} 秒，文件已压到 10MB 以内，直接上传，不要自己再压缩或改用帧图）。上传后等最多 60 秒直到缩略图出现、进度条消失、发送按钮可用。如果站点明确拒绝视频文件（出现不支持的文件类型之类的提示），停止并只回复一行 "VIDEO_NOT_ACCEPTED"。
3. 在输入框粘贴下面这段 prompt（原样，不要改），发送：
<<<PROMPT
${VIDEO_PROMPT}
PROMPT
4. 等 ChatGPT 生成完毕：停止按钮消失、连续两次间隔 5 秒的 get_page_text 内容完全相同，最多等 4 分钟。
5. 把最后一条助手回复完整读出来。回复很长，用 get_page_text 读；若被截断，改用 read_page 并把 max_chars 设为 200000。回复必须以 "## Tags" 一节收尾，没读到 Tags 就再滚到底部重读一次。
6. 最终只输出 ChatGPT 的回答正文，用 \`\`\`markdown 围栏包裹，从 "# " 标题开始到 Tags 结束，不加任何你自己的评论。`;
}

export function consolidatePrompt(spec: string, feedback: string): string {
  return `demo 已经被用户确认。请把 spec 重写成最终精简版，给以后要复用这个效果的工程师（和 Claude Code）看。

输入：
1. 当前 spec.md（逐帧核对版，偏长，含很多测量和"帧中不可判断"的备注）
2. demo-feedback.md（用户看了 demo 后提出的校正，以及每次的修改说明）——这是最高优先级的事实来源，用户纠正过的行为必须写进 spec，并覆盖与之矛盾的旧描述
3. demo/index.html（最终代码，用 Read 读取）——实际实现的参数、时长、缓动以代码为准

要求：
- 长度压到原 spec 的 1/3 左右。删掉像素级测量、重复描述、Verification Notes、"估计"的免责声明、无关的 app 外壳描述。
- 保留：效果是什么、有哪些状态、每个交互怎么动、所有边界时刻的行为（元素相遇/到达极值/出现消失）、技术方案和关键参数。
- 数值只保留代码里实际用到的关键值（尺寸、时长、缓动、颜色），不要帧测量。
- 用户校正过的行为单独成一节"## Craft Details"，每条一句话讲清楚。

${SPEC_FORMAT_HINT}
（在 Technical Approach 之后、Tags 之前加 ## Craft Details）

只输出 spec Markdown，用 \`\`\`markdown 围栏包裹。

当前 spec：
<<<SPEC
${spec}
SPEC

用户反馈记录：
<<<FEEDBACK
${feedback || '（无）'}
FEEDBACK`;
}

export function tweaksPrompt(focus: string, feedback: string, craft: string): string {
  return `当前目录下 demo/index.html 是一个 UI 交互 demo。请用 Read 读取它，然后用 Edit 把它重构成符合下面 Tweaks 约定的版本（行为和外观保持完全一致，只是把硬编码的参数抽成变量）：

${DEMO_CONVENTION}

选参数的优先级（这是最重要的部分，别抽一堆用户不关心的东西）：
1. 用户点名想调的：${focus.trim() ? focus.trim() : '（没有点名）'}
2. 用户在反馈里纠正过的行为所涉及的参数——他们已经证明自己在乎这些：
${feedback.trim() ? feedback.slice(0, 2500) : '（无反馈记录）'}
3. spec 里 Craft Details 提到的细节：
${craft.trim() ? craft.slice(0, 1500) : '（无）'}
4. 一眼能看出差别的手感参数：核心动画时长、缓动/弹簧刚度与阻尼、触发阈值/距离、关键的幅度（位移/缩放倍率）。
不要抽：纯装饰的颜色、边框/阴影细节、字号、内边距、容器尺寸——除非用户点名。总数 4–10 个，宁少勿多，按重要性排序，label 用中文写清楚这个参数影响什么。

要求：
- CSS 里所有用到这些参数的地方改为 var(--x)；JS 里改为现读 tweak("--x")（时长要 parseFloat）。
- 保持 window.__yoink.states 不变。
- 改完只回复一行：抽出了哪些 key。`;
}
