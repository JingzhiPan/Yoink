import { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, protocol } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_ROOT, binary } from './lib/paths.js';
import { extractFrames, makeUploadCopy } from './lib/ffmpeg.js';
import { runClaude, extractJson } from './lib/claude.js';
import { parseSpec, slugify } from './lib/parser.js';
import { verifyPrompt, demoPrompt, feedbackPrompt, comparePrompt, skillPrompt, computerUsePrompt, consolidatePrompt } from './lib/prompts.js';
import { screenshotDemo } from './lib/screenshot.js';
import { parseWithOpenAI } from './lib/openai.js';
import { makeCover, coverPath } from './lib/cover.js';
import * as lib from './lib/library.js';
import type { PatternMeta, Settings, JobEvent, JobKind, InputMethod, Category, Complexity } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const APP_ROOT = path.resolve(__dirname, '..', '..', '..'); // electron/dist/electron → project root

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// yoink://local/<abs path> — serves files from the library into <img>, <video>, and the demo iframe.
protocol.registerSchemesAsPrivileged([
  { scheme: 'yoink', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

// ─── settings (plain json in userData; key in safeStorage) ─────────
interface Stored { inputMethod: InputMethod | null; openaiKeyEnc?: string }
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function loadStored(): Stored {
  try { return JSON.parse(readFileSync(settingsPath(), 'utf8')); } catch { return { inputMethod: null }; }
}
async function saveStored(s: Stored) { await mkdir(path.dirname(settingsPath()), { recursive: true }); await writeFile(settingsPath(), JSON.stringify(s, null, 2)); }
function getOpenAIKey(): string | null {
  const s = loadStored();
  if (!s.openaiKeyEnc) return null;
  try { return safeStorage.decryptString(Buffer.from(s.openaiKeyEnc, 'base64')); } catch { return null; }
}
function settings(): Settings {
  const s = loadStored();
  return { inputMethod: s.inputMethod, libraryRoot: LIBRARY_ROOT, hasOpenAIKey: !!s.openaiKeyEnc, claudePath: binary('claude'), ffmpegPath: binary('ffmpeg') };
}

// ─── jobs ──────────────────────────────────────────────────────────
let mainWin: BrowserWindow | null = null;
// Files dropped on the Dock icon (or opened via Finder) before the window exists are queued.
const pendingOpens: string[] = [];
function deliverOpens() {
  if (!mainWin || pendingOpens.length === 0) return;
  const paths = pendingOpens.splice(0);
  mainWin.webContents.send('open:files', paths);
  mainWin.show(); mainWin.focus();
}
app.on('open-file', (e, filePath) => {
  e.preventDefault();
  if (/\.(mp4|mov|webm|m4v|gif|mkv)$/i.test(filePath)) pendingOpens.push(filePath);
  if (app.isReady()) { if (!mainWin) createWindow(); else deliverOpens(); }
});
const aborts = new Map<string, AbortController>();
function emit(ev: JobEvent) { mainWin?.webContents.send('job:event', ev); }
function jobLogger(jobId: string, patternId: string, kind: JobKind) {
  return (message: string, progress?: number) => emit({ jobId, patternId, kind, type: 'log', message, progress });
}
async function runJob<T>(jobId: string, patternId: string, kind: JobKind, fn: (log: (m: string, p?: number) => void, signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  aborts.set(jobId, ac);
  const log = jobLogger(jobId, patternId, kind);
  try {
    const r = await fn(log, ac.signal);
    emit({ jobId, patternId, kind, type: 'done', progress: 1 });
    return r;
  } catch (e: any) {
    emit({ jobId, patternId, kind, type: 'error', message: e?.message ?? String(e) });
    throw e;
  } finally { aborts.delete(jobId); }
}

// ─── pipeline steps ────────────────────────────────────────────────
/** Cover priority: 2nd demo screenshot (usually the "active" state) → 1st → middle video frame. */
async function refreshCover(id: string) {
  const d = await lib.getPattern(id);
  const mid = d.frames[Math.floor(d.frames.length / 2)];
  try { await makeCover([d.demoScreenshots[1], d.demoScreenshots[0], mid, d.frames[0]], coverPath(d.dir)); } catch (e) { console.warn('cover failed', e); }
}
async function stepExtract(jobId: string, videoPath: string): Promise<PatternMeta> {
  const base = path.basename(videoPath, path.extname(videoPath));
  const id = slugify(base);
  const meta = await lib.createPattern(id, base, videoPath);
  return runJob(jobId, meta.id, 'extract', async (log) => {
    const d = await lib.getPattern(meta.id);
    const { count, duration } = await extractFrames(d.videoPath!, path.join(d.dir, 'frames'), log);
    const m = await lib.updateMeta(meta.id, { frame_count: count, video_duration_sec: Math.round(duration * 10) / 10, status: 'frames_extracted' });
    await refreshCover(meta.id);
    return m;
  });
}

/** Any input method ends here: raw text → parser → raw-spec.md */
async function stepStoreRaw(id: string, text: string, method: InputMethod): Promise<PatternMeta> {
  const parsed = parseSpec(text);
  await lib.writeText(id, 'raw-spec.md', parsed.markdown);
  const meta = await lib.readMeta(id);
  const looksAuto = /^pattern-|^[a-z0-9-]+$/.test(meta.name) || meta.name === meta.id;
  return lib.updateMeta(id, {
    status: 'raw_spec', input_method: method,
    name: looksAuto && parsed.name ? parsed.name : meta.name,
    tags: meta.tags.length ? meta.tags : parsed.tags,
  });
}

async function stepVerify(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'verify', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.rawSpec) throw new Error('还没有原始 spec');
    log('Claude 正在逐帧核对 spec…');
    const out = await runClaude({ prompt: verifyPrompt(d.meta, d.rawSpec, d.frames), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
    const md = out.match(/```(?:markdown|md)\s*([\s\S]*?)```/i)?.[1]?.trim();
    const metaJson = extractJson<{ name?: string; tags?: string[]; category?: Category; complexity?: Complexity; tech_hints?: string[] }>(out.slice(out.lastIndexOf('```json')));
    if (!md) throw new Error('Claude 输出里没找到 spec Markdown 块。原文：\n' + out.slice(0, 500));
    await lib.writeText(id, 'spec.md', md + '\n');
    const patch: Partial<PatternMeta> = { status: 'verified' };
    if (metaJson) {
      if (metaJson.name) patch.name = metaJson.name;
      if (Array.isArray(metaJson.tags) && metaJson.tags.length) patch.tags = metaJson.tags.map(String);
      if (metaJson.category) patch.category = metaJson.category;
      if (metaJson.complexity) patch.complexity = metaJson.complexity;
      if (Array.isArray(metaJson.tech_hints)) patch.tech_hints = metaJson.tech_hints.map(String);
    }
    return lib.updateMeta(id, patch);
  });
}

async function stepDemo(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'demo', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.spec) throw new Error('还没有 verified spec');
    await lib.updateMeta(id, { status: 'demo_wip' });
    await mkdir(path.join(d.dir, 'demo'), { recursive: true });
    log('Claude Code 正在生成 demo…');
    await runClaude({ prompt: demoPrompt(d.spec, d.frames), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
    if (!existsSync(path.join(d.dir, 'demo', 'index.html'))) throw new Error('Claude 没有写出 demo/index.html');
    return lib.readMeta(id);
  });
}

async function stepScreenshot(jobId: string, id: string, compare: boolean): Promise<PatternMeta> {
  return runJob(jobId, id, 'screenshot', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.demoIndex) throw new Error('还没有 demo');
    const shots = await screenshotDemo(d.demoIndex, path.join(d.dir, 'demo-screenshots'), log);
    await lib.updateMeta(id, { demo_screenshot_count: shots.length });
    await refreshCover(id);
    if (compare && d.frames.length) {
      log('Claude 正在比对 demo 截图和原始帧…');
      const report = await runClaude({ prompt: comparePrompt(d.frames, shots), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
      await lib.writeText(id, 'demo-compare.md', report.trim() + '\n');
    }
    return lib.readMeta(id);
  });
}

async function stepFeedback(jobId: string, id: string, feedback: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'feedback', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.demoIndex || !d.spec) throw new Error('还没有 demo');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    log('Claude Code 正在按反馈修改 demo…');
    const out = await runClaude({ prompt: feedbackPrompt(feedback, d.feedbackLog ?? '', d.spec), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
    await lib.appendText(id, 'demo-feedback.md', `## ${stamp}\n**反馈：** ${feedback}\n\n**修改：** ${out.trim()}\n\n`);
    return lib.updateMeta(id, { status: 'demo_wip' });
  });
}

/** On demo confirm: fold the user's corrections + final code back into a compact spec. */
async function stepConsolidate(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'consolidate', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.spec || !d.demoIndex) throw new Error('需要 spec 和 demo');
    if (d.demoScreenshots.length === 0) {
      log('先给 demo 截一轮图…');
      const shots = await screenshotDemo(d.demoIndex, path.join(d.dir, 'demo-screenshots'), log);
      await lib.updateMeta(id, { demo_screenshot_count: shots.length });
      await refreshCover(id);
    }
    log('Claude 正在把校正合并回 spec 并精简…');
    const out = await runClaude({ prompt: consolidatePrompt(d.spec, d.feedbackLog ?? ''), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
    const md = out.match(/```(?:markdown|md)\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (!md || md.length < 200) throw new Error('精简 spec 输出异常：\n' + out.slice(0, 300));
    if (!existsSync(path.join(d.dir, 'spec-verified.md'))) await lib.writeText(id, 'spec-verified.md', d.spec);
    await lib.writeText(id, 'spec.md', md + '\n');
    return lib.setStatus(id, 'demo_done');
  });
}

async function stepSkill(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'skill', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.spec || !d.demoIndex) throw new Error('需要先确认 demo');
    log('Claude Code 正在打包 skill…');
    await runClaude({ prompt: skillPrompt(d.meta, d.spec, d.demoScreenshots), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
    if (!existsSync(path.join(d.dir, 'skill', 'SKILL.md'))) throw new Error('Claude 没有写出 skill/SKILL.md');
    // copy demo screenshots into the skill so it is self-contained
    const shotDir = path.join(d.dir, 'skill', 'screenshots');
    await mkdir(shotDir, { recursive: true });
    const { copyFile } = await import('node:fs/promises');
    for (const s of d.demoScreenshots) await copyFile(s, path.join(shotDir, path.basename(s)));
    return lib.readMeta(id);
  });
}

async function stepParseAuto(jobId: string, id: string, method: InputMethod): Promise<PatternMeta> {
  return runJob(jobId, id, 'parse', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (method === 'api') {
      const key = getOpenAIKey();
      if (!key) throw new Error('还没有填 OpenAI API key');
      const text = await parseWithOpenAI(key, d.frames, d.meta.video_duration_sec, log);
      return stepStoreRaw(id, text, 'api');
    }
    // computer_use: Claude Code + Chrome extension drives the user's logged-in ChatGPT tab
    const uploadPath = await makeUploadCopy(d.videoPath!, path.join(d.dir, 'upload.mp4'), 8 * 1024 * 1024, log);
    log('Claude Code 正在通过 Chrome 操作 ChatGPT…');
    const out = await runClaude({
      prompt: computerUsePrompt(uploadPath, d.meta.video_duration_sec), cwd: d.dir,
      allowedTools: ['mcp__claude-in-chrome__*'], extraArgs: ['--chrome'], onLog: log, signal,
    });
    // markers only count when they are the whole reply, not mentioned in prose
    const head = out.trim().split('\n')[0].trim();
    if (head === 'NOT_LOGGED_IN') throw new Error('Chrome 里的 ChatGPT 没登录，先登录再试');
    if (head === 'VIDEO_NOT_ACCEPTED') throw new Error('ChatGPT 网页不接受这个视频文件');
    const fence = out.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (!fence) throw new Error('Claude 没拿到 spec，它说：\n' + out.slice(0, 600));
    const md = fence;
    if (md.length < 200) throw new Error('从 ChatGPT 刮回来的内容太短：\n' + out.slice(0, 300));
    return stepStoreRaw(id, md, 'computer_use');
  });
}

// ─── IPC ───────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => settings());
ipcMain.handle('settings:setInputMethod', async (_e, m: InputMethod) => { await saveStored({ ...loadStored(), inputMethod: m }); return settings(); });
ipcMain.handle('settings:setOpenAIKey', async (_e, key: string) => {
  const s = loadStored();
  if (!key) delete s.openaiKeyEnc; else s.openaiKeyEnc = safeStorage.encryptString(key).toString('base64');
  await saveStored(s); return settings();
});

ipcMain.handle('library:list', () => lib.listPatterns());
ipcMain.handle('pattern:get', (_e, id: string) => lib.getPattern(id));
ipcMain.handle('pattern:updateMeta', (_e, id: string, patch: Partial<PatternMeta>) => lib.updateMeta(id, patch));
ipcMain.handle('pattern:delete', (_e, id: string) => lib.deletePattern(id));
ipcMain.handle('variant:save', (_e, id: string, name: string, note?: string) => lib.saveVariant(id, name, note));
ipcMain.handle('variant:restore', (_e, id: string, slug: string) => lib.restoreVariant(id, slug));
ipcMain.handle('variant:delete', (_e, id: string, slug: string) => lib.deleteVariant(id, slug));
ipcMain.handle('pattern:fork', (_e, id: string, name: string, fromVariant?: string) => lib.forkPattern(id, name, fromVariant));
ipcMain.handle('pattern:refreshCover', async (_e, id: string) => {
  const d = await lib.getPattern(id);
  if (d.demoIndex && d.demoScreenshots.length === 0) {
    const shots = await screenshotDemo(d.demoIndex, path.join(d.dir, 'demo-screenshots'), () => {});
    await lib.updateMeta(id, { demo_screenshot_count: shots.length });
  }
  await refreshCover(id); return lib.getPattern(id);
});
ipcMain.handle('pattern:rename', (_e, id: string, newId: string) => lib.renamePatternId(id, slugify(newId)));
ipcMain.handle('pattern:saveSpec', async (_e, id: string, md: string) => { await lib.writeText(id, 'spec.md', md); return lib.readMeta(id); });
ipcMain.handle('pattern:saveSkillMd', async (_e, id: string, md: string) => { await lib.writeText(id, 'skill/SKILL.md', md); return lib.readMeta(id); });
ipcMain.handle('pattern:readFile', (_e, p: string) => readFile(p, 'utf8'));

ipcMain.handle('pipeline:import', (_e, jobId: string, videoPath: string) => stepExtract(jobId, videoPath));
ipcMain.handle('pipeline:storeRaw', (_e, id: string, text: string, method: InputMethod) => stepStoreRaw(id, text, method));
ipcMain.handle('pipeline:parseAuto', (_e, jobId: string, id: string, method: InputMethod) => stepParseAuto(jobId, id, method));
ipcMain.handle('pipeline:verify', (_e, jobId: string, id: string) => stepVerify(jobId, id));
ipcMain.handle('pipeline:demo', (_e, jobId: string, id: string) => stepDemo(jobId, id));
ipcMain.handle('pipeline:screenshot', (_e, jobId: string, id: string, compare: boolean) => stepScreenshot(jobId, id, compare));
ipcMain.handle('pipeline:feedback', (_e, jobId: string, id: string, fb: string) => stepFeedback(jobId, id, fb));
ipcMain.handle('pipeline:confirmDemo', (_e, jobId: string, id: string) => stepConsolidate(jobId, id));
ipcMain.handle('pipeline:skill', (_e, jobId: string, id: string) => stepSkill(jobId, id));
ipcMain.handle('pipeline:packSkill', (_e, id: string) => lib.setStatus(id, 'skill_ready'));
ipcMain.handle('pipeline:cancel', (_e, jobId: string) => { aborts.get(jobId)?.abort(); });

ipcMain.handle('files:selectVideos', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'gif', 'mkv'] }] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('shell:showInFinder', (_e, p: string) => shell.showItemInFolder(p));
ipcMain.handle('shell:openExternal', (_e, u: string) => shell.openExternal(u));
ipcMain.handle('mcp:info', () => ({ serverPath: path.join(APP_ROOT, 'mcp', 'server.mjs'), libraryRoot: LIBRARY_ROOT, nodePath: process.execPath }));

// ─── window ────────────────────────────────────────────────────────
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700,
    titleBarStyle: 'hiddenInset', backgroundColor: '#0d0d0c', icon: path.join(APP_ROOT, 'build', 'icon-1024.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false, contextIsolation: true, nodeIntegration: false },
  });
  if (isDev) mainWin.loadURL(DEV_URL);
  else mainWin.loadFile(path.join(APP_ROOT, 'dist', 'index.html'));
  mainWin.on('closed', () => (mainWin = null));
  mainWin.webContents.on('did-finish-load', () => setTimeout(deliverOpens, 300));
}

app.whenReady().then(async () => {
  await lib.ensureLibrary();
  // backfill covers for patterns created before cover generation existed
  lib.listPatterns().then(async (ps) => { for (const p of ps) if (!existsSync(coverPath(lib.patternDir(p.id)))) await refreshCover(p.id); }).catch(() => {});
  if (process.platform === 'darwin') app.dock?.setIcon(path.join(APP_ROOT, 'build', 'icon-1024.png'));
  protocol.handle('yoink', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname);
      const data = await readFile(filePath);
      const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(data, { headers: { 'Content-Type': mime, 'Content-Length': String(data.length), 'Access-Control-Allow-Origin': '*' } });
    } catch (err: any) {
      return new Response(err?.message ?? 'error', { status: err?.code === 'ENOENT' ? 404 : 500 });
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
