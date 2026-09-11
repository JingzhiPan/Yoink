# YOINK

本地 UI 素材管理工具：拖视频进去，拿经过验证的 spec、可运行 demo、Claude Code skill 出来。

## 跑起来

```bash
brew install ffmpeg        # 抽帧
npm install
npm start                  # 开发模式（vite + Electron）
```

需要机器上装好并登录 **Claude Code**（`claude` 命令）：交叉核对、生成 demo、按反馈改 demo、打包 skill 全部通过 `claude -p` 在本地跑，不用另填 Anthropic key。

## 流程

1. 拖视频 → ffmpeg 自动抽关键帧（场景检测，太平滑则均匀抽 12 帧）
2. 解析成原始 spec，三种方式：
   - **API 模式**：填一次 OpenAI key，关键帧发给 GPT 视觉模型，自动出 spec
   - **Computer Use**：（未实现）
   - **手动模式**：自己去 ChatGPT 处理，把文字粘进来。格式随意，parser 会整理成统一格式
3. **交叉核对**：Claude 逐帧看图校验原始 spec，删脑补、补漏项、修技术方案 → `spec.md`
4. Spec tab 里可以直接改 spec、打标签
5. Demo tab：Claude Code 生成 `demo/index.html`（自包含，定义 `window.__yoink.states`）→ "截图比对" 按每个状态离屏截图，再让 Claude 和原始帧比对出报告 → 底部输入框说"动画太快了"直接让 Claude 改 → 满意点"确认 demo"
6. Skill tab：打包成 `skill/`（SKILL.md + component/ + spec.md + screenshots/）→ "打包 skill"

## 素材库

默认在 `~/yoink/<slug>/`，结构和 brief 一致（source.mp4、frames/、raw-spec.md、spec.md、demo/、demo-screenshots/、skill/、meta.json）。环境变量 `YOINK_LIBRARY` 可改位置。

## 接到 Claude Code

```bash
claude mcp add --scope user yoink -- node "$(pwd)/mcp/server.mjs"
```

暴露 5 个 tool：`search_patterns`、`get_spec`、`get_frames`、`get_demo_screenshots`、`get_skill`。纯文件系统，无网络无鉴权。
