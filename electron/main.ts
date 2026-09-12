import { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, protocol } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY_ROOT, binary } from './lib/paths.js';
import { extractFrames, makeUploadCopy } from './lib/ffmpeg.js';
import { runClaude, extractJson } from './lib/claude.js';
import { parseSpec, slugify } from './lib/parser.js';
import { verifyPrompt, demoPrompt, feedbackPrompt, comparePrompt, skillPrompt, computerUsePrompt, consolidatePrompt, tweaksPrompt, retagPrompt, materialPrompt, selfCheckPrompt, modeBlock, outlinePrompt, materializePrompt } from './lib/prompts.js';
import { screenshotDemo } from './lib/screenshot.js';
import { parseWithOpenAI } from './lib/openai.js';
import { makeCover, coverPath, makeMaterialCrops, makeMaterialCropsFrom, cropRegion } from './lib/cover.js';
import * as lib from './lib/library.js';
import type { PatternMeta, Settings, JobEvent, JobKind, InputMethod, Category, Complexity, TagFacets, JudgmentItem } from '../shared/types.js';

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

const TWEAK_BRIDGE = `<script>(function(){
  function manifest(){ var l=(window.__yoink&&window.__yoink.tweaks)||[]; var cs=getComputedStyle(document.documentElement);
    return l.map(function(t){ var o={}; for (var k in t) o[k]=t[k]; o.value=cs.getPropertyValue(t.key).trim(); return o; }); }
  function reply(src){ try { src.postMessage({type:'yoink:tweaks',tweaks:manifest()},'*'); } catch(e){} }
  window.addEventListener('message',function(e){ var m=e.data||{};
    if(m.type==='yoink:get-tweaks'){ reply(e.source); }
    else if(m.type==='yoink:set-tweak'){ document.documentElement.style.setProperty(m.key,m.value); }
    else if(m.type==='yoink:zoom'){ document.documentElement.style.zoom=String(m.zoom||1); }
    else if(m.type==='yoink:get-rect'){ var el=null; try{ el=document.querySelector(m.selector); }catch(x){} if(el){ var r=el.getBoundingClientRect(); var z=parseFloat(document.documentElement.style.zoom)||1; try{ e.source.postMessage({type:'yoink:rect',selector:m.selector,rect:{x:r.left/z,y:r.top/z,w:r.width/z,h:r.height/z}},'*'); }catch(x){} } }
    else if(m.type==='yoink:reset-tweaks'){ (m.keys||[]).forEach(function(k){ document.documentElement.style.removeProperty(k); }); reply(e.source); } });
  window.addEventListener('load',function(){ if(window.parent!==window) reply(window.parent); });
})();</script>`;

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
  if (/\.(mp4|mov|webm|m4v|gif|mkv|png|jpe?g|webp)$/i.test(filePath)) pendingOpens.push(filePath);
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
  try { await makeCover([d.demoScreenshots[1], d.demoScreenshots[0], mid, d.frames[0], d.refs[0]], coverPath(d.dir)); } catch (e) { console.warn('cover failed', e); }
}
/** frames when there is a video, otherwise the reference photos */
const imagesOf = (d: { frames: string[]; refs: string[] }) => (d.frames.length ? d.frames : d.refs);

async function stepImportImages(jobId: string, paths: string[]): Promise<PatternMeta> {
  const base = path.basename(paths[0], path.extname(paths[0]));
  const meta = await lib.createPatternFromImages(slugify(base) || 'ref', base, paths);
  return runJob(jobId, meta.id, 'extract', async (log) => {
    log(`收了 ${paths.length} 张参考图`);
    await refreshCover(meta.id);
    return lib.readMeta(meta.id);
  });
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
    if (!imagesOf(d).length) throw new Error('没有关键帧也没有参考图');
    const out = await runClaude({ prompt: verifyPrompt(d.meta, d.rawSpec, imagesOf(d), !d.frames.length), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
    const md = out.match(/```(?:markdown|md)\s*([\s\S]*?)```/i)?.[1]?.trim();
    const metaJson = extractJson<{ name?: string; tags?: string[]; category?: Category; complexity?: Complexity; tech_hints?: string[] }>(out.slice(out.lastIndexOf('```json')));
    if (!md) throw new Error('Claude 输出里没找到 spec Markdown 块。原文：\n' + out.slice(0, 500));
    await lib.writeText(id, 'spec.md', md + '\n');
    const patch: Partial<PatternMeta> = { status: 'verified' };
    if (metaJson) {
      if (metaJson.name) patch.name = metaJson.name;
      const tf = facetsOf(metaJson);
      if (tf) { patch.tag_facets = tf; patch.tags = Object.values(tf); }
      else if (Array.isArray(metaJson.tags) && metaJson.tags.length) patch.tags = metaJson.tags.map(String).slice(0, 6);
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
    await runClaude({ prompt: demoPrompt(d.spec, imagesOf(d), d.judgment, d.materialCrops, modeBlock(d.meta)), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
    if (!existsSync(path.join(d.dir, 'demo', 'index.html'))) throw new Error('Claude 没有写出 demo/index.html');
    return lib.readMeta(id);
  });
}

/** Screenshot every demo state, then let Claude pair each shot with its original frame and write the report. */
async function shootAndCompare(d: Awaited<ReturnType<typeof lib.getPattern>>, log: (m: string) => void, signal: AbortSignal) {
  const shots = await screenshotDemo(d.demoIndex!, path.join(d.dir, 'demo-screenshots'), log);
  await lib.updateMeta(d.meta.id, { demo_screenshot_count: shots.length });
  await refreshCover(d.meta.id);
  if (!d.frames.length) return;
  log('Claude 正在比对 demo 截图和原始帧…');
  const out = await runClaude({ prompt: comparePrompt(d.frames, shots), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
  const jm = out.match(/```json\s*([\s\S]*?)```\s*$/);
  let report = out;
  if (jm) {
    report = out.slice(0, jm.index).trim();
    try {
      const pairs = (JSON.parse(jm[1]).pairs as { shot: string; frame: string | null; note?: string }[])
        .map((p) => ({ shot: path.basename(p.shot), frame: p.frame ? path.basename(p.frame) : null, note: p.note ?? '' }))
        .filter((p) => shots.some((s) => path.basename(s) === p.shot));
      await lib.writeText(d.meta.id, 'demo-compare.json', JSON.stringify(pairs, null, 2) + '\n');
    } catch { log('配对 JSON 解析失败，只保留文字报告'); }
  }
  await lib.writeText(d.meta.id, 'demo-compare.md', report.trim() + '\n');
}

async function stepScreenshot(jobId: string, id: string, compare: boolean): Promise<PatternMeta> {
  return runJob(jobId, id, 'screenshot', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.demoIndex) throw new Error('还没有 demo');
    if (compare) await shootAndCompare(d, log, signal);
    else {
      const shots = await screenshotDemo(d.demoIndex, path.join(d.dir, 'demo-screenshots'), log);
      await lib.updateMeta(id, { demo_screenshot_count: shots.length });
      await refreshCover(id);
    }
    return lib.readMeta(id);
  });
}

/** Normalise the tag_facets object Claude returns; null if unusable. */
function facetsOf(j: any): TagFacets | null {
  const f = j?.tag_facets; if (!f || typeof f !== 'object') return null;
  const out: TagFacets = {};
  for (const k of ['what', 'look', 'ux', 'feels_like', 'for'] as const) {
    const v = typeof f[k] === 'string' ? f[k].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

async function stepRetag(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'retag', async (log, signal) => {
    const d = await lib.getPattern(id);
    const spec = d.spec ?? d.rawSpec; if (!spec) throw new Error('还没有 spec');
    log('Claude 正在按五个维度重新整理标签…');
    const out = await runClaude({ prompt: retagPrompt(d.meta, spec), cwd: d.dir, allowedTools: [], onLog: log, signal });
    const j = extractJson<any>(out.slice(out.lastIndexOf('```json')));
    const tf = facetsOf(j); if (!tf) throw new Error('没解析到标签 JSON：\n' + out.slice(0, 300));
    const patch: Partial<PatternMeta> = { tag_facets: tf, tags: Object.values(tf) };
    if (Array.isArray(j.tech_hints)) patch.tech_hints = j.tech_hints.map(String).slice(0, 5);
    const m = await lib.updateMeta(id, patch);
    await syncSpecTags(id);
    return m;
  });
}

/** A variant is its own conversation: its index.html + feedback.md, never demo/. */
function variantTarget(d: Awaited<ReturnType<typeof lib.getPattern>>, slug?: string) {
  if (!slug) return { file: 'demo/index.html', abs: d.demoIndex!, log: 'demo-feedback.md', history: d.feedbackLog ?? '' };
  const v = d.variants.find((x) => x.slug === slug); if (!v) throw new Error('方案不存在');
  return { file: `variants/${slug}/index.html`, abs: v.index, log: `variants/${slug}/feedback.md`, history: v.feedbackLog ?? '' };
}

async function stepFeedback(jobId: string, id: string, feedback: string, variant?: string, crop?: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'feedback', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.demoIndex || !d.spec) throw new Error('还没有 demo');
    const t = variantTarget(d, variant);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    log(variant ? 'Claude Code 正在按反馈修改这个方案…' : 'Claude Code 正在按反馈修改 demo…');
    const shot = crop ? d.demoScreenshots[1] ?? d.demoScreenshots[0] : undefined;
    const out = await runClaude({ prompt: feedbackPrompt(feedback, t.history, d.spec, t.file, crop, shot, modeBlock(d.meta)), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
    await lib.appendText(id, t.log, `## ${stamp}\n**反馈：** ${feedback}${crop ? `\n（附对照图 ${path.relative(d.dir, crop)}）` : ''}\n\n**修改：** ${out.trim()}\n\n`);
    // give it eyes: screenshot the result and let it compare against the reference itself
    const selfCheck = d.meta.self_check ?? (d.refs.length > 0 || d.frames.length === 0);
    if (selfCheck && !variant) {
      // look → fix → look again, until it stops editing; the last round is read-only so the report describes what is actually on screen
      const { stat } = await import('node:fs/promises');
      const MAX = 3;
      for (let round = 1; round <= MAX; round++) {
        log(round === 1 ? '截图，让 Claude 自己看一眼改得对不对…' : `第 ${round} 轮自查：重新截图看上一轮修得对不对…`);
        const shots = await screenshotDemo(t.abs, path.join(d.dir, 'demo-screenshots'), log);
        await lib.updateMeta(id, { demo_screenshot_count: shots.length });
        const before = (await stat(t.abs)).mtimeMs;
        const final = round === MAX;
        const note = await runClaude({ prompt: selfCheckPrompt(t.file, shots, imagesOf(d), feedback, crop, round, final, modeBlock(d.meta)), cwd: d.dir, allowedTools: final ? ['Read'] : ['Read', 'Edit'], onLog: log, signal });
        await lib.appendText(id, t.log, `**自查 ${round}：** ${note.trim()}\n\n`);
        if ((await stat(t.abs)).mtimeMs === before) break; // it looked and left the file alone: report matches the screen
      }
      await refreshCover(id);
    }
    return variant ? lib.readMeta(id) : lib.updateMeta(id, { status: 'demo_wip' });
  });
}

/** On demo confirm: fold the user's corrections + final code back into a compact spec. */
async function stepConsolidate(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'consolidate', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.spec || !d.demoIndex) throw new Error('需要 spec 和 demo');
    log('先给最终 demo 截一轮图并和原始帧比对…');
    await shootAndCompare(d, log, signal);
    log('Claude 正在把校正合并回 spec 并精简…');
    const out = await runClaude({ prompt: consolidatePrompt(d.spec, d.feedbackLog ?? '', d.judgment, modeBlock(d.meta)), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
    const diff = out.match(/```diff-md\s*([\s\S]*?)```/i)?.[1]?.trim();
    const md = out.match(/```(?:markdown|md)\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (!md || md.length < 200) throw new Error('精简 spec 输出异常：\n' + out.slice(0, 300));
    if (!existsSync(path.join(d.dir, 'spec-verified.md'))) await lib.writeText(id, 'spec-verified.md', d.spec);
    if (diff) await lib.writeText(id, 'consolidate-diff.md', diff + '\n');
    await lib.writeText(id, 'spec.md', md + '\n');
    await lib.setStatus(id, 'demo_done');
    if (existsSync(path.join(d.dir, 'skill', 'SKILL.md'))) {
      log('spec 变了，重新打包 skill…');
      await packSkillFiles(id, log, signal);
      return lib.setStatus(id, 'skill_ready');
    }
    return lib.readMeta(id);
  });
}

async function stepTweaks(jobId: string, id: string, focus = '', variant?: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'tweaks', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.demoIndex) throw new Error('还没有 demo');
    const t = variantTarget(d, variant);
    const craft = d.spec?.match(/## Craft Details([\s\S]*?)(\n## |$)/)?.[1] ?? '';
    log(focus ? `Claude Code 正在按「${focus}」抽取 tweaks…` : 'Claude Code 正在把 demo 的参数抽成 tweaks…');
    await runClaude({ prompt: tweaksPrompt(focus, t.history, craft, t.file), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit'], onLog: log, signal });
    if (variant) await lib.updateVariant(id, variant, { hidden_tweaks: [] }); else await lib.updateMeta(id, { hidden_tweaks: [] });
    const html = await readFile(t.abs, 'utf8');
    if (!/id="yoink-tweaks"/.test(html) || !/__yoink\.tweaks/.test(html)) throw new Error('demo 里没找到 tweaks 约定的 style 块或清单');
    return lib.readMeta(id);
  });
}

/** Persist tweak values into the <style id="yoink-tweaks"> block of demo/index.html. */
async function applyTweaks(id: string, values: Record<string, string>, variant?: string) {
  const d = await lib.getPattern(id);
  if (!d.demoIndex) throw new Error('还没有 demo');
  const t = variantTarget(d, variant);
  let html = await readFile(t.abs, 'utf8');
  const m = html.match(/(<style id="yoink-tweaks">)([\s\S]*?)(<\/style>)/);
  if (!m) throw new Error('demo 里没有 yoink-tweaks style 块，先抽取 tweaks');
  let block = m[2];
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp('(' + k.replace(/[-]/g, '\\-') + '\\s*:\\s*)[^;]+(;)');
    block = re.test(block) ? block.replace(re, `$1${v}$2`) : block.replace(/}\s*$/, `  ${k}: ${v};\n}`);
  }
  html = html.replace(m[0], m[1] + block + m[3]);
  await writeFile(t.abs, html);
}

async function packSkillFiles(id: string, log: (m: string) => void, signal: AbortSignal) {
  const d = await lib.getPattern(id);
  if (!d.spec || !d.demoIndex) throw new Error('需要先确认 demo');
  log('Claude Code 正在打包 skill…');
  await runClaude({ prompt: skillPrompt(d.meta, d.spec, d.demoScreenshots), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
  if (!existsSync(path.join(d.dir, 'skill', 'SKILL.md'))) throw new Error('Claude 没有写出 skill/SKILL.md');
  // copy demo screenshots + handoff into the skill so it is self-contained
  const shotDir = path.join(d.dir, 'skill', 'screenshots');
  await mkdir(shotDir, { recursive: true });
  const { copyFile } = await import('node:fs/promises');
  for (const s of d.demoScreenshots) await copyFile(s, path.join(shotDir, path.basename(s)));
  if (d.handoff) await writeFile(path.join(d.dir, 'skill', 'handoff.md'), d.handoff);
}
async function stepSkill(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'skill', async (log, signal) => { await packSkillFiles(id, log, signal); return lib.readMeta(id); });
}

/** Shape first: rebuild silhouettes as single paths with point handles, flat-filled. */
async function stepOutline(jobId: string, id: string, brief: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'outline', async (log, signal) => {
    const d = await lib.getPattern(id);
    await mkdir(path.join(d.dir, 'demo'), { recursive: true });
    if (d.demoIndex) { await mkdir(path.join(d.dir, 'variants'), { recursive: true }); await lib.saveVariant(id, '定形前', '先定形再上材质之前的自动备份'); log('当前 demo 已另存为方案「定形前」'); }
    log('Claude 正在把造型重画成一条轮廓线…');
    await runClaude({ prompt: outlinePrompt(brief, imagesOf(d), !!d.demoIndex, modeBlock(d.meta)), cwd: d.dir, allowedTools: ['Read', 'Write', 'Edit', 'Glob'], onLog: log, signal });
    if (!existsSync(path.join(d.dir, 'demo', 'index.html'))) throw new Error('Claude 没有写出 demo/index.html');
    return lib.updateMeta(id, { status: 'demo_wip', outline_ok: false, hidden_tweaks: [] });
  });
}

/** Outline confirmed → paint the material stack onto it. */
async function stepMaterialize(jobId: string, id: string): Promise<PatternMeta> {
  return runJob(jobId, id, 'materialize', async (log, signal) => {
    const d = await lib.getPattern(id);
    if (!d.demoIndex || !d.spec) throw new Error('需要 spec 和定好形的 demo');
    await lib.updateMeta(id, { outline_ok: true });
    log('Claude 正在把材质层挂到轮廓上…');
    await runClaude({ prompt: materializePrompt(d.spec, imagesOf(d), d.judgment, modeBlock(d.meta)), cwd: d.dir, allowedTools: ['Read', 'Edit', 'Glob'], onLog: log, signal });
    log('截图看一眼…');
    const shots = await screenshotDemo(d.demoIndex, path.join(d.dir, 'demo-screenshots'), log);
    await lib.updateMeta(id, { demo_screenshot_count: shots.length });
    await refreshCover(id);
    return lib.readMeta(id);
  });
}

/** Material pass: zoomed crops of two frames → layer stack into spec.md + the human-judgment list. */
type Pick = { frame: string; rect: { x: number; y: number; w: number; h: number } };
async function stepMaterial(jobId: string, id: string, picks: Pick[] = []): Promise<PatternMeta> {
  return runJob(jobId, id, 'material', async (log, signal) => {
    const d = await lib.getPattern(id);
    const imgs = imagesOf(d);
    if (!d.spec || !imgs.length) throw new Error('需要先有核对过的 spec 和关键帧或参考图');
    log('裁放大图…');
    const n = imgs.length;
    const autoPicks = [...new Set([Math.floor(n * 0.3), Math.floor(n * 0.7)])].map((i) => imgs[Math.min(n - 1, i)]);
    const { rm } = await import('node:fs/promises');
    await rm(path.join(d.dir, 'material'), { recursive: true, force: true });
    const crops: string[] = [];
    if (picks.length) for (const [i, p] of picks.entries()) crops.push(...await makeMaterialCropsFrom(p.frame, p.rect, path.join(d.dir, 'material'), `crop-${i + 1}-${path.basename(p.frame, '.png')}`));
    else for (const [i, f] of autoPicks.entries()) crops.push(...await makeMaterialCrops(f, path.join(d.dir, 'material'), `crop-${i + 1}-${path.basename(f, '.png')}`));
    log('Claude 正在拆材质层栈、列待判定问题…');
    const out = await runClaude({ prompt: materialPrompt(d.spec, crops, imgs, !d.frames.length), cwd: d.dir, allowedTools: ['Read'], onLog: log, signal });
    const md = out.match(/```(?:markdown|md)\s*([\s\S]*?)```/i)?.[1]?.trim();
    const j = extractJson<{ items?: any[] }>(out.slice(out.lastIndexOf('```json')));
    if (!md) throw new Error('没解析到材质层栈：\n' + out.slice(0, 300));
    await lib.upsertSpecSection(id, 'Material Layers', md);
    const old = d.judgment ?? [];
    const items: JudgmentItem[] = (j?.items ?? []).map((it: any, i: number) => {
      const q = String(it.q ?? '').trim();
      const prev = old.find((o) => o.q === q);
      return { id: prev?.id ?? `j${Date.now().toString(36)}${i}`, kind: (['aesthetic', 'shape', 'mechanism', 'ownership', 'physics'].includes(it.kind) ? it.kind : 'mechanism'), q, options: Array.isArray(it.options) ? it.options.map(String) : [], frame: String(it.frame ?? ''), where: String(it.where ?? ''), verify: String(it.verify ?? ''), answer: prev?.answer ?? '' };
    }).filter((it: JudgmentItem) => it.q);
    await lib.saveJudgment(id, items);
    return lib.readMeta(id);
  });
}

/** After a retag, mirror the facets into the spec's own Tags section so the file and meta agree. */
async function syncSpecTags(id: string) {
  const d = await lib.getPattern(id);
  if (!d.spec || !/^## Tags/m.test(d.spec)) return;
  await lib.upsertSpecSection(id, 'Tags', d.meta.tags.join(', '));
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
ipcMain.handle('pattern:fork', (_e, id: string, name: string, fromVariant?: string, deviation?: string) => lib.forkPattern(id, name, fromVariant, deviation ?? ''));
ipcMain.handle('pipeline:outline', (_e, jobId: string, id: string, brief: string) => stepOutline(jobId, id, brief));
ipcMain.handle('pipeline:materialize', (_e, jobId: string, id: string) => stepMaterialize(jobId, id));
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
ipcMain.handle('pipeline:importImages', (_e, jobId: string, paths: string[]) => stepImportImages(jobId, paths));
ipcMain.handle('refs:add', (_e, id: string, paths: string[]) => lib.addRefs(id, paths));
ipcMain.handle('pipeline:storeRaw', (_e, id: string, text: string, method: InputMethod) => stepStoreRaw(id, text, method));
ipcMain.handle('pipeline:parseAuto', (_e, jobId: string, id: string, method: InputMethod) => stepParseAuto(jobId, id, method));
ipcMain.handle('pipeline:verify', (_e, jobId: string, id: string) => stepVerify(jobId, id));
ipcMain.handle('pipeline:demo', (_e, jobId: string, id: string) => stepDemo(jobId, id));
ipcMain.handle('pipeline:screenshot', (_e, jobId: string, id: string, compare: boolean) => stepScreenshot(jobId, id, compare));
ipcMain.handle('pipeline:feedback', (_e, jobId: string, id: string, fb: string, variant?: string, crop?: string) => stepFeedback(jobId, id, fb, variant, crop));
ipcMain.handle('pipeline:material', (_e, jobId: string, id: string, picks?: Pick[]) => stepMaterial(jobId, id, picks ?? []));
ipcMain.handle('judgment:save', (_e, id: string, items: JudgmentItem[]) => lib.saveJudgment(id, items));
ipcMain.handle('frame:crop', async (_e, id: string, frame: string, r: { x: number; y: number; w: number; h: number }) => {
  const d = await lib.getPattern(id);
  const out = path.join(d.dir, 'crops', `${Date.now().toString(36)}-${path.basename(frame, '.png')}.png`);
  return cropRegion(frame, out, r);
});
ipcMain.handle('pipeline:retag', (_e, jobId: string, id: string) => stepRetag(jobId, id));
ipcMain.handle('variant:update', (_e, id: string, slug: string, patch: Record<string, unknown>) => lib.updateVariant(id, slug, patch));
ipcMain.handle('pipeline:confirmDemo', (_e, jobId: string, id: string) => stepConsolidate(jobId, id));
ipcMain.handle('pipeline:tweaks', (_e, jobId: string, id: string, focus?: string, variant?: string) => stepTweaks(jobId, id, focus ?? '', variant));
ipcMain.handle('demo:applyTweaks', (_e, id: string, values: Record<string, string>, variant?: string) => applyTweaks(id, values, variant));
ipcMain.handle('pipeline:skill', (_e, jobId: string, id: string) => stepSkill(jobId, id));
ipcMain.handle('pipeline:packSkill', (_e, id: string) => lib.setStatus(id, 'skill_ready'));
ipcMain.handle('pipeline:cancel', (_e, jobId: string) => { aborts.get(jobId)?.abort(); });

ipcMain.handle('files:selectVideos', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video or reference image', extensions: ['mp4', 'mov', 'webm', 'm4v', 'gif', 'mkv', 'png', 'jpg', 'jpeg', 'webp'] }] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('files:selectImages', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
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
      let data: Uint8Array | string = new Uint8Array(await readFile(filePath));
      const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      // demo pages get a tiny postMessage bridge so the (cross-origin) app can read/set tweaks
      if (/\/(demo|variants\/[^/]+)\/index\.html$/.test(filePath)) {
        const html = Buffer.from(data).toString('utf8');
        data = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, TWEAK_BRIDGE + '</body>') : html + TWEAK_BRIDGE;
      }
      return new Response(data as any, { headers: { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' } });
    } catch (err: any) {
      return new Response(err?.message ?? 'error', { status: err?.code === 'ENOENT' ? 404 : 500 });
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
