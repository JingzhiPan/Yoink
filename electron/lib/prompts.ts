import type { PatternMeta, JudgmentItem } from '../../shared/types.js';
import { MODE_LABEL, modeOf } from '../../shared/types.js';

export const TAG_RULES = `标签规则（严格）：一共 4–6 个英文 kebab-case 标签，按下面五个维度各选最多一个，宁缺毋滥：
- what：这是个什么东西（slider / card-deck / radial-menu / folder / toggle / modal …）
- look：属于哪种 UI 审美大类（glassmorphism / gooey / neumorphism / flat / skeuomorphic / ios-native / brutalist …）
- ux：哪个方向的 UX（direct-manipulation / hover-reveal / drag-to-adjust / expand-collapse / focus-spotlight / progressive-disclosure …）
- feels_like：像什么实物，可选（liquid / candy / playing-cards / paper / jelly / glass …）
- for：干嘛用的（adjust-value / share / pick-option / showcase / navigate / confirm …）
技术实现（svg-filter、backdrop-filter、spring…）不算标签，放 tech_hints。不要写 micro-interaction、css、react 这类没有区分度的词。`;

export const SPEC_FORMAT_HINT = `统一 spec 格式（Markdown）：
# <Pattern name in English>
## Overview — 一段话讲这个效果是什么、给人什么感觉
## Core Principle — 设计意图。像一个懂工程的设计师给 coding agent 讲：所有表现背后的那一条生成规则是什么（例如"距离决定两个实体之间是否长出液桥"），它应该被抽象成什么可复用的 primitive（组件/参数/状态），做对了"手感"是什么、做错了会露馅在哪。这是这个效果的灵魂，别写成现象罗列。
## Timeline — 按秒的事件序列（0.0s 初始态 → 0.4s 点击 → …），只写视频里真发生的
## Visual States — 列出所有可见状态（initial / hover / active / open / closing …），每个状态描述布局、颜色、形状、尺寸关系
## Interactions & Timing — 每个交互：触发条件 → 变化 → 时长/缓动/弹簧参数（能估就估，给数值）
## Technical Approach — 推荐实现方式（CSS / SVG filter / canvas / 动画库），关键技术点逐条说明
## Tags — 逗号分隔的英文标签
（Core Principle 和 Timeline 靠看视频才写得出，帧核对时保留原文不删）

三栏原则：spec 里每一条陈述都属于且只属于三类之一——**证据**（视频/照片里看得到的，默认，不用标）、**决定**（用户定的，写进 ## Design Decisions）、**推断**（模型按物理、惯例或"应该是这样"补的，写进 ## Inferred，每条注明依据）。不确定的东西不要写成证据。`;

/** Mode context every demo-side prompt gets: what this pattern is relative to its origin, and what edits must respect. */
export function modeBlock(meta: PatternMeta): string {
  const mode = modeOf(meta);
  if (mode === 'replicate') return '';
  const origin = meta.origin ? `分支自「${meta.origin.name}」（${meta.origin.id}${meta.origin.variant ? ' / ' + meta.origin.variant : ''}）。` : '';
  const dev = meta.deviation?.trim();
  return `这条是${MODE_LABEL[mode]}。${origin}
偏离声明（边界，所有修改都要守）：
${dev || '（用户还没写。默认：交互和结构沿用原作，材质和造型按用户反馈和参考图来。）'}
规则：声明里"保留"的部分继续对原作负责，不要顺手改；"改掉"的部分对参考图、物理和用户反馈负责，不要退回原作的做法。拿不准某个改动越没越界，在回复里点名问，不要猜。
`;
}

export function verifyPrompt(meta: PatternMeta, rawSpec: string, frames: string[], isRefs = false): string {
  return `你是 UI 交互效果的技术审阅者。${isRefs ? `这个 pattern 没有视频，只有 ${frames.length} 张参考图（真实产品/材质照片或设计稿），另有一份用户写的原始 spec，说的是想做成什么。参考图是材质和造型的依据，交互部分以 spec 为准、不要因为图里看不到就删。` : `有一段 UI 演示视频，已抽出 ${frames.length} 张关键帧（按时间顺序），另有一份由其他模型（可能是 GPT）看视频写出的原始 spec。`}你的任务是"交叉核对"：用 Read 工具逐张查看帧图，然后逐条校验原始 spec。

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
{"name": "英文名", "tag_facets": {"what": "...", "look": "...", "ux": "...", "feels_like": "...", "for": "..."}, "category": "micro-interaction|transition|layout|data-viz|navigation|form|feedback|creative", "complexity": "low|medium|high", "tech_hints": ["..."]}
${TAG_RULES}
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
- 性能：禁止无条件的 requestAnimationFrame / setInterval 死循环。需要按变量重算几何或路径的，只在变化时做：页面加载时一次、收到 window 上的 "yoink:tweak" 事件（外部改 tweak 时会派发，detail.key 是变了的变量）、以及 pointer/transition 事件期间的短时窗口（几百毫秒后自动停）。静止时页面必须是零 JS、零重绘——backdrop-filter 和 blur 层每帧重画会把 GPU 吃满。
- Tweaks 约定：把最值得调的参数（时长、缓动/弹簧、颜色、尺寸、阈值，6–14 个）写成 :root 上的 CSS 变量，放在 <style id="yoink-tweaks">:root{ --x: 300ms; ... }</style> 这个独立 style 块里（只放变量，一行一个）。JS 里需要这些数值时用
  const tweak = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  在每次用到时现读（不要启动时缓存），这样外部改变量能实时生效。再声明清单：
  window.__yoink.tweaks = [{ key: "--x", label: "展开时长", type: "range", min: 100, max: 1200, step: 10, unit: "ms" }, { key: "--accent", label: "主色", type: "color" }, ...]
  type 有 range / color / text / points；range 的值写成 数字+unit（unit 可为空）。
  6–14 个是抽取时的目标数量，不是硬上限：按反馈改 demo 时不要为了凑数把已有的 tweak 删掉或冻成常量，需要新参数就往清单里加。
  points 用于形状：值是 "x% y%, x% y%, ..." 这样的点列（相对某个元素的百分比坐标），CSS 里直接 clip-path: polygon(var(--k)) 或按点位计算；清单项要带 target: "<该元素的 CSS 选择器>"，外部会在 demo 上叠出可拖的手柄。凡是"这块高光/雾面/光带的形状、跨度、角点"这类用语言说不清的东西，一律做成 points，不要让人用文字描述形状。`;

export function judgmentBlock(items: JudgmentItem[] | null): string {
  if (!items?.length) return '';
  const done = items.filter((j) => j.answer.trim()), open = items.filter((j) => !j.answer.trim());
  const L: string[] = [];
  if (done.length) L.push('用户已经判定的（这是决定，不是猜测，照做）：', ...done.map((j) => `- ${j.q} → ${j.answer}`));
  if (open.length) L.push('用户还没判定的（按第一个候选做，但在代码里把它做成一个明显可切换/可调的开关或 tweak，并在回复里点名）：', ...open.map((j) => `- ${j.q}  候选：${j.options.join(' / ')}`));
  return L.join('\n') + '\n';
}

export function demoPrompt(spec: string, frames: string[], judgment: JudgmentItem[] | null = null, crops: string[] = [], mode = ''): string {
  return `${mode}根据下面这份经过验证的 UI 交互 spec，在当前目录写出一个可运行的 working demo。先用 Read 看关键帧（原始视频抽出来的）以对齐视觉细节，再写代码。

关键帧：
${frames.map((f) => `- ${f}`).join('\n')}
${crops.length ? `\n材质放大图（看材质、高光、边缘时以这些为准，比整帧清楚得多）：\n${crops.map((f) => `- ${f}`).join('\n')}\n` : ''}
${judgmentBlock(judgment)}
${DEMO_CONVENTION}

用 Write 工具写文件到 demo/index.html（相对当前目录）。写完后简短总结你实现了哪些状态。

spec：
<<<SPEC
${spec}
SPEC`;
}

export function feedbackPrompt(feedback: string, history: string, spec: string, file = 'demo/index.html', crop?: string, shot?: string, mode = ''): string {
  return `${mode}当前目录下 ${file} 是根据 spec 生成的 UI 交互 demo${file !== 'demo/index.html' ? '（这是一个独立分支方案，只改这个文件，不要碰 demo/index.html）' : ''}。用户看过效果后给出反馈，请用 Read 读取 ${file}，按反馈用 Edit 修改（保持 window.__yoink.states 约定不变，如需可增删状态）。改完一句话说明改了什么。不要为了 tweak 数量把已有的 tweak 删掉或冻成常量。
${crop ? `
用户从原始视频帧上框了一块放大图作为对照：${crop}
${shot ? `demo 当前最接近的状态截图：${shot}` : ''}
先 Read 放大图${shot ? '和截图' : ''}，逐层说出你在原图那块看到的东西（形状、位置、软硬、方向、浓淡、叠加方式）和 demo 里对应实现的差别，再改。用户的文字是指方向，图才是标准。
` : ''}
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

export function consolidatePrompt(spec: string, feedback: string, judgment: JudgmentItem[] | null = null, mode = ''): string {
  return `${mode}demo 已经被用户确认。请把 spec 重写成最终精简版，给以后要复用这个效果的工程师（和 Claude Code）看。

输入：
1. 当前 spec.md（逐帧核对版，偏长，含很多测量和"帧中不可判断"的备注）
2. demo-feedback.md（用户看了 demo 后提出的校正，以及每次的修改说明）——这是最高优先级的事实来源，用户纠正过的行为必须写进 spec，并覆盖与之矛盾的旧描述
3. demo/index.html（最终代码，用 Read 读取）——实际实现的参数、时长、缓动以代码为准
4. 用户对"待判定"问题的回答（下面）

分两步，两步都要输出：

第一步：先写一份 diff，用 \`\`\`diff-md 围栏包裹（是 Markdown，不是 diff 语法），三节：
## 被推翻的
- 核对版里哪些描述被反馈或最终代码否定了（原话 → 现在的认识）
## 新发现的
- 核对版完全没提、在改 demo 过程中才认识到的东西（材质层、机制、归属……）
## 用户决定的
- 视频证明不了、是用户拍板的选择（例如两种翻转版本都能对上帧，用户选了 B）

第二步：按这份 diff **重写全文**，不是在旧文后面追加。硬性要求：
- Overview 和 Core Principle 必须反映 diff 里的每一条"被推翻"和"新发现"。如果用户在过程中给出了整体定性的话（比如"像塑料薄片，中间略鼓，四边压平"），那句话就该出现在 Overview 里。检查方法：Craft Details 里出现的每一类东西（材质/高光/翻转/堆叠……），Overview 里都要有一句对应的话。
- "用户决定的"单独成一节 ## Design Decisions，放在 Craft Details 之前，每条写清楚：决定是什么、另一个候选是什么、为什么不能当视频事实。
- 模型自己按物理/惯例补的、既没证据也不是用户定的，单独成一节 ## Inferred，放在 Craft Details 之后，每条注明依据。三栏之外不要有第四种陈述。
- 长度压到原 spec 的 1/3 左右。删掉像素级测量、重复描述、Verification Notes、"估计"的免责声明、无关的 app 外壳描述。
- 保留：效果是什么、有哪些状态、每个交互怎么动、所有边界时刻的行为、技术方案和关键参数。已有的 ## Material Layers 一节按最终代码修订后保留。
- 数值只保留代码里实际用到的关键值。

其他要求：
- 长度压到原 spec 的 1/3 左右。删掉像素级测量、重复描述、Verification Notes、"估计"的免责声明、无关的 app 外壳描述。
- 保留：效果是什么、有哪些状态、每个交互怎么动、所有边界时刻的行为（元素相遇/到达极值/出现消失）、技术方案和关键参数。
- 数值只保留代码里实际用到的关键值（尺寸、时长、缓动、颜色），不要帧测量。
- 用户校正过的行为单独成一节"## Craft Details"，每条一句话讲清楚。

${SPEC_FORMAT_HINT}
（在 Technical Approach 之后加 ## Design Decisions 和 ## Craft Details，再 Tags）

先输出 \`\`\`diff-md 围栏，再输出 spec Markdown（\`\`\`markdown 围栏）。

当前 spec：
<<<SPEC
${spec}
SPEC

用户反馈记录：
<<<FEEDBACK
${feedback || '（无）'}
FEEDBACK

${judgmentBlock(judgment) || '（没有待判定清单）'}`;
}

export function tweaksPrompt(focus: string, feedback: string, craft: string, file = 'demo/index.html'): string {
  return `当前目录下 ${file} 是一个 UI 交互 demo${file !== 'demo/index.html' ? '（独立分支方案，只改这个文件）' : ''}。请用 Read 读取它，然后用 Edit 把它重构成符合下面 Tweaks 约定的版本（行为和外观保持完全一致，只是把硬编码的参数抽成变量）：

${DEMO_CONVENTION}

选参数的优先级（这是最重要的部分，别抽一堆用户不关心的东西）：
1. 用户点名想调的：${focus.trim() ? focus.trim() : '（没有点名）'}
2. 用户在反馈里纠正过的行为所涉及的参数——他们已经证明自己在乎这些：
${feedback.trim() ? feedback.slice(0, 2500) : '（无反馈记录）'}
3. spec 里 Craft Details 提到的细节：
${craft.trim() ? craft.slice(0, 1500) : '（无）'}
4. 一眼能看出差别的手感参数：核心动画时长、缓动/弹簧刚度与阻尼、触发阈值/距离、关键的幅度（位移/缩放倍率）。
形状类的东西（高光跨度、雾面四边形角点、光带位置）用 points 类型 + target 选择器，不要拆成一堆数字。
不要抽：纯装饰的颜色、边框/阴影细节、字号、内边距、容器尺寸——除非用户点名。总数 4–10 个，宁少勿多，按重要性排序，label 用中文写清楚这个参数影响什么。

要求：
- CSS 里所有用到这些参数的地方改为 var(--x)；JS 里改为现读 tweak("--x")（时长要 parseFloat）。
- 保持 window.__yoink.states 不变。
- 改完只回复一行：抽出了哪些 key。`;
}

export function retagPrompt(meta: PatternMeta, spec: string): string {
  return `给下面这个 UI 交互 pattern 重新整理标签。

${TAG_RULES}

只输出一个 \`\`\`json 围栏：
{"tag_facets": {"what": "...", "look": "...", "ux": "...", "feels_like": "...", "for": "..."}, "tech_hints": ["..."]}
feels_like 想不到贴切的就省略。tech_hints 保留 2–5 个最关键的实现技术。

当前名称：${meta.name}
当前标签（太多太杂，要收）：${meta.tags.join(', ')}
当前 tech_hints：${meta.tech_hints.join(', ') || '（无）'}

spec：
${spec.slice(0, 5000)}`;
}

export function materialPrompt(spec: string, crops: string[], images: string[], isRefs: boolean): string {
  return `你是做 UI 材质还原的设计工程师，懂一点光学。下面是一个 UI 效果的${isRefs ? '参考照片' : '视频关键帧'}和它们的放大裁切图。请全部 Read，然后按四步做。

放大图（主体 2x、中心细节 3x，看层次以这些为准）：
${crops.map((f) => `- ${f}`).join('\n')}
整图（看位置关系）：
${images.map((f) => `- ${f}`).join('\n')}

第一步 · 物理层（先别看图，只根据材质和几何推）。先用一个材质词定性（玻璃 / 塑料薄片 / 亚克力 / 乳胶 / 金属 / 纸 / 果冻 …）并写出几何（薄壁筒、圆环、囊、平板 …），然后列出光学上"应该有"的层：镜面高光的锐度由表面粗糙度决定、菲涅尔带来的边缘压暗或边缘反光、次表面散射带来的透光暖色、薄处淡厚处浓的厚度着色、自阴影和接触阴影落在哪、卷边/圆环的内外高光位置由光源方向决定。每条写依据。最后定一个**光源约定**：方向、软硬、色温；demo 里所有高光和阴影都从这一个光源推，才会互相一致。

第二步 · 照片层。Read 放大图，像 Figma 图层面板那样把主体表面从上到下拆成一层一层：形状、位置（主体自身百分比坐标）、软硬（估 blur 半径）、衰减方向、浓淡（估 opacity）、叠加方式、判断依据（哪张放大图的哪里）。区分"画在单个元素上的"和"多个元素重叠才出现的"。

第三步 · 交叉对账，得到理想化层栈。逐层判定来源：
- 照片里有、物理也预期 → 保留，参数按物理和光源约定修正（来源写"交叉"）
- 照片里有、物理解释不了 → 拍摄噪音（环境反光、眩光、脏点、这盏灯的偶然），默认不画（来源写"照片-噪音"）
- 物理预期有、照片里看不清 → 补上并标"推断"（来源写"物理"）
输出一张表，列：# | 层 | 形状 | 位置 | 软硬 | 衰减方向 | 浓淡 | 叠加 | 来源 | 依据。表前先写材质定性一句话和光源约定一行。

第四步 · 待人工判定清单。凡是第三步里拿不准的对账，每条一个问题，kind 用 "physics"，options 固定给三个："按物理来" / "按照片来" / "丢掉"（可以在每个后面括号补一句这意味着什么）。另外照旧列这四类：aesthetic（审美意图）、shape（形状）、mechanism（机制二选一）、ownership（归属）。每条给候选、看哪张图的哪个位置能判断、在 demo 里怎么验证。只列真会改变做法的，4–10 条。

输出格式：先一个 \`\`\`markdown 围栏，内容是第三步的材质定性、光源约定和理想化层栈表（不要标题行）；再一个 \`\`\`json 围栏：
{"items":[{"kind":"physics|aesthetic|shape|mechanism|ownership","q":"问题一句话","options":["按物理来（…）","按照片来（…）","丢掉"],"frame":"ref-01.jpg","where":"套身左侧边缘","verify":"…"}]}

spec 供参考（不要复述它，你看到的比它细）：
${spec.slice(0, 4000)}`;
}

/** After a feedback edit with no video to compare against: Claude looks at its own screenshots next to the reference and fixes what it can see. */
export function selfCheckPrompt(file: string, shots: string[], refs: string[], feedback: string, crop?: string, round = 1, final = false, mode = ''): string {
  return `${mode}你刚按用户反馈改了 ${file}。下面是**改完后**真实渲染出来的每个状态截图（这是无头浏览器刚刚跑出来的，不是猜的，不要说"没有浏览器环境"），以及用户的参考图${crop ? '和他框出来的对照放大图' : ''}。请先 Read 全部图片，用眼睛检查你刚才的修改是否真的到位。${round > 1 ? `这是第 ${round} 轮：上一轮你看完又改了一次，这些截图是改完之后重新渲染的。` : ''}${final ? '这是最后一轮，只看不改：没有 Edit 工具，只输出报告。' : '看得见的问题直接用 Edit 修掉，修完会再截图给你看一遍；如果都到位了就什么都别改，直接报告。'}

用户这次的反馈：
${feedback}

改完的截图：
${shots.map((f) => `- ${f}`).join('\n')}
参考图：
${refs.map((f) => `- ${f}`).join('\n')}
${crop ? `对照放大图：${crop}\n` : ''}
检查三件事：① 反馈要求的改动在截图里看得见吗；② 有没有改出穿帮（形状不闭合、层错位、旧形状残留、颜色发灰过曝）；③ 和参考图比，材质读法对不对（高光锐度、边缘压暗、透光感）。
${final ? '' : `修的话只改 ${file}，保持 window.__yoink.states 和已有 tweaks 不变。`}最后只输出一段话：你在截图里看到了什么、${final ? '' : '修了什么、'}还有什么需要用户自己定。不要客套。`;
}

/**
 * Shape first: rebuild each object's silhouette as ONE closed SVG path with draggable control points,
 * flat-filled, no material. The designer confirms the outline before any highlight is painted on it.
 */
export function outlinePrompt(brief: string, images: string[], hasDemo: boolean, mode: string): string {
  return `${mode}先定形，再上材质。${hasDemo ? '当前目录下 demo/index.html 已有一版 demo，用 Read 读它：保留它的布局、状态（window.__yoink.states）、交互和 tweaks 里与形状无关的部分，但把每个主体的**造型**推倒重画。' : '在当前目录写一个新的 demo/index.html。'}

用户要的形状：
${brief.trim() || '（没写，按参考图和现有 demo 判断）'}

参考图 / 关键帧（Read 看造型，不看材质）：
${images.map((f) => `- ${f}`).join('\n')}

造型规则（这是这一步的全部意义）：
- 每个主体只有**一条闭合轮廓路径**。像画家画剪影：鼓出来的部分、收窄的部分、卷边、囊、耳朵，全是这一条线上的起伏，不是贴上去的另一个 div 或另一个椭圆。禁止用多个盒子拼形状、禁止用 mask 抠角来假装形变。
- 路径由一组控制点生成：写一个 JS 函数 shape(points) → path d，points 是 "x% y%, x% y%, …" 的点列（相对该主体的包围盒），用平滑曲线（Catmull-Rom 或三次贝塞尔）过这些点。把这个点列做成 type "points" 的 tweak（清单里带 target 选择器，指向该主体的包围盒元素），外部会在 demo 上叠出手柄让设计师拖。会变形的部分（按压、展开）就是对点列做插值，同一条线在动。
- 所有后面要挂的东西——描边、发光、压暗、高光、裁切——将来都引用这同一条路径（clip-path: path() / SVG <use> / mask），现在先不画。
- 现在只画：平涂的底色 + 1px 描边，背景照旧。不要任何高光、阴影、模糊、渐变、毛玻璃。看起来像一张剪纸就对了。
- 保持 window.__yoink.states 约定；tweaks 清单里形状相关的只留 points（一个主体一个），其他 tweak 原样保留。

${DEMO_CONVENTION}

用 Write/Edit 写到 demo/index.html。改完只回复：每个主体的点数、points 的 key、以及你不确定的造型判断（一两条）。`;
}

/** Outline confirmed: paint the material layer stack onto the confirmed path(s). */
export function materializePrompt(spec: string, images: string[], judgment: JudgmentItem[] | null, mode: string): string {
  return `${mode}造型已经被用户确认。当前目录下 demo/index.html 是只有平涂和描边的剪纸版：每个主体是一条由 points tweak 驱动的闭合路径。现在把材质挂上去。用 Read 读 demo/index.html 和参考图，然后用 Edit 改。

铁律：
- **不许动路径**。points 的 key、点数、shape() 函数、包围盒都不动，不新增任何用来"补形状"的元素。
- 每一层材质（描边、边缘压暗、高光、阴影、发光、毛玻璃、色片）都必须引用那条路径：clip-path: path()、SVG <use href>、或以路径为 mask。这样以后拖点、按压变形时所有层一起动。
- 层的内容按 spec 里 ## Material Layers 的理想化层栈来，光源按那里的光源约定，所有高光和阴影从同一个光源推。
- 每一层的关键参数（浓淡、软硬、位置）做成 tweak；形状类的位置用 points。抽取时目标 6–14 个，超过就把最不重要的冻成常量并在回复里列出来。
- 保持 window.__yoink.states 不变。

${judgmentBlock(judgment)}
参考图 / 关键帧：
${images.map((f) => `- ${f}`).join('\n')}

${DEMO_CONVENTION}

spec（看 Material Layers 和 Craft Details）：
${spec.slice(0, 6000)}

改完只回复：挂了哪几层、各引用了哪条路径、哪些参数做成了 tweak。`;
}
