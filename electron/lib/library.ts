import { mkdir, readdir, readFile, writeFile, copyFile, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT } from './paths.js';
import type { PatternMeta, PatternDetail, PatternStatus, DemoVariant, JudgmentItem, TweakInfo, Traits } from '../../shared/types.js';
import { JUDGMENT_KIND_LABEL, MODE_LABEL, modeOf, REALISM_LABEL } from '../../shared/types.js';

export function patternDir(id: string) { return path.join(LIBRARY_ROOT, id); }

export async function ensureLibrary() { await mkdir(LIBRARY_ROOT, { recursive: true }); }

export function defaultMeta(id: string, name: string): PatternMeta {
  return {
    id, name, status: 'frames_extracted', tags: [], category: 'micro-interaction',
    tech_hints: [], complexity: 'medium', source_url: '', source_author: '',
    video_duration_sec: 0, frame_count: 0, demo_screenshot_count: 0,
    input_method: '', created: new Date().toISOString().slice(0, 10), notes: '',
  };
}

export async function readMeta(id: string): Promise<PatternMeta> {
  const raw = await readFile(path.join(patternDir(id), 'meta.json'), 'utf8');
  return { ...defaultMeta(id, id), ...JSON.parse(raw) };
}
export async function writeMeta(meta: PatternMeta) {
  await writeFile(path.join(patternDir(meta.id), 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
}
export async function updateMeta(id: string, patch: Partial<PatternMeta>): Promise<PatternMeta> {
  const m = { ...(await readMeta(id)), ...patch, id };
  await writeMeta(m);
  return m;
}
export async function setStatus(id: string, status: PatternStatus) { return updateMeta(id, { status }); }

export async function listPatterns(): Promise<PatternMeta[]> {
  await ensureLibrary();
  const entries = await readdir(LIBRARY_ROOT, { withFileTypes: true });
  const out: PatternMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (!existsSync(path.join(LIBRARY_ROOT, e.name, 'meta.json'))) continue;
    try { out.push(await readMeta(e.name)); } catch { /* skip broken */ }
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}

async function listPngs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort().map((f) => path.join(dir, f));
}
async function readOpt(p: string): Promise<string | null> {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}
async function walk(dir: string, base = dir): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base)));
    else out.push(path.relative(base, p));
  }
  return out.sort();
}

async function readJsonOpt<T>(p: string): Promise<T | null> { const t = await readOpt(p); if (!t) return null; try { return JSON.parse(t) as T; } catch { return null; } }

export async function getPattern(id: string): Promise<PatternDetail> {
  const d = await getPatternRaw(id);
  d.tweakList = d.demoIndex ? parseTweakList(await readFile(d.demoIndex, 'utf8')) : [];
  d.handoff = buildHandoff(d);
  // keep handoff.md on disk for the MCP server / designers opening the folder
  const hp = path.join(d.dir, 'handoff.md');
  if (d.handoff && (await readOpt(hp)) !== d.handoff) await writeFile(hp, d.handoff);
  return d;
}

async function getPatternRaw(id: string): Promise<PatternDetail> {
  const dir = patternDir(id);
  const meta = await readMeta(id);
  const videoCandidates = (await readdir(dir)).filter((f) => /^source\.(mp4|mov|webm|m4v|gif|mkv)$/i.test(f));
  const demoIndex = path.join(dir, 'demo', 'index.html');
  return {
    meta, dir,
    videoPath: videoCandidates[0] ? path.join(dir, videoCandidates[0]) : null,
    cover: existsSync(path.join(dir, 'cover.png')) ? path.join(dir, 'cover.png') : null,
    frames: await listPngs(path.join(dir, 'frames')),
    refs: await listPngs(path.join(dir, 'refs')),
    demoScreenshots: await listPngs(path.join(dir, 'demo-screenshots')),
    rawSpec: await readOpt(path.join(dir, 'raw-spec.md')),
    spec: await readOpt(path.join(dir, 'spec.md')),
    specVerified: await readOpt(path.join(dir, 'spec-verified.md')),
    demoIndex: existsSync(demoIndex) ? demoIndex : null,
    demoCompare: await readOpt(path.join(dir, 'demo-compare.md')),
    judgment: await readJsonOpt<JudgmentItem[]>(path.join(dir, 'judgment.json')),
    materialCrops: await listPngs(path.join(dir, 'material')),
    consolidateDiff: await readOpt(path.join(dir, 'consolidate-diff.md')),
    handoff: null, tweakList: [],
    traits: await readJsonOpt<Traits>(path.join(dir, 'traits.json')),
    comparePairs: await readJsonOpt(path.join(dir, 'demo-compare.json')),
    skillMd: await readOpt(path.join(dir, 'skill', 'SKILL.md')),
    skillFiles: await walk(path.join(dir, 'skill')),
    feedbackLog: await readOpt(path.join(dir, 'demo-feedback.md')),
    variants: await listVariants(dir),
  };
}

/** Copy reference photos into refs/ (keeps extension; names de-duplicated). */
export async function addRefs(id: string, paths: string[]): Promise<string[]> {
  const rd = path.join(patternDir(id), 'refs');
  await mkdir(rd, { recursive: true });
  const out: string[] = [];
  for (const p of paths) {
    const ext = path.extname(p).toLowerCase().replace('.jpeg', '.jpg') || '.png';
    let name = path.basename(p, path.extname(p)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ref';
    let dst = path.join(rd, name + ext); let n = 2;
    while (existsSync(dst)) dst = path.join(rd, `${name}-${n++}${ext}`);
    await copyFile(p, dst); out.push(dst);
  }
  return out;
}

/** A pattern that starts from reference photos instead of a video. */
export async function createPatternFromImages(id: string, name: string, paths: string[]): Promise<PatternMeta> {
  await ensureLibrary();
  let finalId = id; let n = 2;
  while (existsSync(patternDir(finalId))) finalId = `${id}-${n++}`;
  await mkdir(patternDir(finalId), { recursive: true });
  const meta = { ...defaultMeta(finalId, name), input_method: 'manual' as const, notes: '从参考图开始的二创', self_check: true };
  await writeMeta(meta);
  await addRefs(finalId, paths);
  return meta;
}

/** Create the pattern folder and copy the source video in. */
export async function createPattern(id: string, name: string, videoPath: string): Promise<PatternMeta> {
  await ensureLibrary();
  let finalId = id;
  let n = 2;
  while (existsSync(patternDir(finalId))) finalId = `${id}-${n++}`;
  const dir = patternDir(finalId);
  await mkdir(dir, { recursive: true });
  const ext = path.extname(videoPath).toLowerCase() || '.mp4';
  await copyFile(videoPath, path.join(dir, `source${ext}`));
  const meta = defaultMeta(finalId, name);
  await writeMeta(meta);
  return meta;
}

export async function renamePatternId(oldId: string, newId: string): Promise<string> {
  if (oldId === newId || existsSync(patternDir(newId))) return oldId;
  const { rename } = await import('node:fs/promises');
  await rename(patternDir(oldId), patternDir(newId));
  await updateMeta(newId, { id: newId });
  return newId;
}

export async function deletePattern(id: string) {
  await rm(patternDir(id), { recursive: true, force: true });
}

export async function writeText(id: string, rel: string, content: string) {
  const p = path.join(patternDir(id), rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content);
}
export async function appendText(id: string, rel: string, content: string) {
  const p = path.join(patternDir(id), rel);
  const prev = await readOpt(p);
  await writeFile(p, (prev ?? '') + content);
}
export async function fileSize(p: string) { try { return (await stat(p)).size; } catch { return 0; } }

// ─── demo variants ──────────────────────────────────────────────
async function listVariants(dir: string): Promise<DemoVariant[]> {
  const vd = path.join(dir, 'variants');
  if (!existsSync(vd)) return [];
  const out: DemoVariant[] = [];
  for (const e of await readdir(vd, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const idx = path.join(vd, e.name, 'index.html');
    if (!existsSync(idx)) continue;
    let m: any = {};
    try { m = JSON.parse(await readFile(path.join(vd, e.name, 'variant.json'), 'utf8')); } catch { /* */ }
    out.push({ slug: e.name, name: m.name ?? e.name, created: m.created ?? '', note: m.note ?? '', index: idx, feedbackLog: await readOpt(path.join(vd, e.name, 'feedback.md')), hidden_tweaks: Array.isArray(m.hidden_tweaks) ? m.hidden_tweaks : [] });
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}
export async function saveVariant(id: string, name: string, note = ''): Promise<DemoVariant[]> {
  const dir = patternDir(id);
  const { cp } = await import('node:fs/promises');
  let slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'variant';
  slug = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${slug}`;
  const vd = path.join(dir, 'variants', slug);
  await mkdir(vd, { recursive: true });
  await cp(path.join(dir, 'demo'), vd, { recursive: true });
  // the variant's conversation continues from the fork point
  if (existsSync(path.join(dir, 'demo-feedback.md'))) await cp(path.join(dir, 'demo-feedback.md'), path.join(vd, 'feedback.md'));
  await writeFile(path.join(vd, 'variant.json'), JSON.stringify({ name, note, created: new Date().toISOString(), hidden_tweaks: [] }, null, 2));
  return listVariants(dir);
}
export async function updateVariant(id: string, slug: string, patch: Record<string, unknown>): Promise<void> {
  const p = path.join(patternDir(id), 'variants', slug, 'variant.json');
  let m: any = {}; try { m = JSON.parse(await readFile(p, 'utf8')); } catch { /* */ }
  await writeFile(p, JSON.stringify({ ...m, ...patch }, null, 2));
}
export async function restoreVariant(id: string, slug: string): Promise<void> {
  const dir = patternDir(id);
  const { cp } = await import('node:fs/promises');
  const vd = path.join(dir, 'variants', slug);
  if (!existsSync(path.join(vd, 'index.html'))) throw new Error('方案不存在');
  await rm(path.join(dir, 'demo'), { recursive: true, force: true });
  await cp(vd, path.join(dir, 'demo'), { recursive: true });
  await rm(path.join(dir, 'demo', 'variant.json'), { force: true });
  if (existsSync(path.join(dir, 'demo', 'feedback.md'))) { await cp(path.join(dir, 'demo', 'feedback.md'), path.join(dir, 'demo-feedback.md')); await rm(path.join(dir, 'demo', 'feedback.md'), { force: true }); }
  await rm(path.join(dir, 'demo-screenshots'), { recursive: true, force: true });
  await rm(path.join(dir, 'demo-compare.md'), { force: true });
}
export async function deleteVariant(id: string, slug: string): Promise<void> {
  await rm(path.join(patternDir(id), 'variants', slug), { recursive: true, force: true });
}
/** Branch the whole pattern into a new folder; optionally start it from a saved variant. */
export async function forkPattern(id: string, newName: string, fromVariant?: string, deviation = ''): Promise<PatternMeta> {
  const { cp } = await import('node:fs/promises');
  const src = patternDir(id);
  let newId = newName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (newId.length < 3) newId = `${id}-fork`;
  let finalId = newId; let n = 2;
  while (existsSync(patternDir(finalId))) finalId = `${newId}-${n++}`;
  const dst = patternDir(finalId);
  await cp(src, dst, { recursive: true, filter: (p) => !/\/(variants|skill|demo-screenshots)(\/|$)/.test(p) && !/demo-compare\.md$/.test(p) });
  if (fromVariant) {
    await rm(path.join(dst, 'demo'), { recursive: true, force: true });
    await cp(path.join(src, 'variants', fromVariant), path.join(dst, 'demo'), { recursive: true });
    await rm(path.join(dst, 'demo', 'variant.json'), { force: true });
    if (existsSync(path.join(dst, 'demo', 'feedback.md'))) { await cp(path.join(dst, 'demo', 'feedback.md'), path.join(dst, 'demo-feedback.md')); await rm(path.join(dst, 'demo', 'feedback.md'), { force: true }); }
  }
  const meta = await readMeta(finalId);
  const origin = await readMeta(id);
  return updateMeta(finalId, { id: finalId, name: newName, status: 'demo_wip', favorite: false, demo_screenshot_count: 0, notes: meta.notes, created: new Date().toISOString().slice(0, 10), mode: 'remix', origin: { id, name: origin.name, variant: fromVariant }, deviation, self_check: true, outline_ok: false });
}

// ─── handoff ────────────────────────────────────────────────────
/** Pull `{ key, label, type, unit }` out of the demo's window.__yoink.tweaks manifest without executing it. */
export function parseTweakList(html: string): TweakInfo[] {
  const m = html.match(/__yoink\.tweaks\s*=\s*\[([\s\S]*?)\];/);
  if (!m) return [];
  const out: TweakInfo[] = [];
  for (const obj of m[1].match(/\{[^{}]*\}/g) ?? []) {
    const g = (k: string) => obj.match(new RegExp(k + '\\s*:\\s*["\']([^"\']*)["\']'))?.[1];
    const key = g('key'); if (!key) continue;
    out.push({ key, label: g('label') ?? key, type: g('type') ?? 'range', unit: g('unit') });
  }
  return out;
}

function section(spec: string, name: string): string {
  return spec.match(new RegExp('^## ' + name + '[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'))?.[1]?.trim() ?? '';
}

/** One page for whoever picks the demo up: what the video proves, what the user decided, what is still open, what the dials do. */
export function buildHandoff(d: PatternDetail): string | null {
  if (!d.spec) return null;
  const s = d.spec;
  const L: string[] = [`# ${d.meta.name} · 交接`, '', `> pattern \`${d.meta.id}\` · ${d.meta.status} · ${d.meta.tags.join(', ')}`, ''];
  if (d.meta.intent?.trim()) L.push('## 想表现什么', '', d.meta.intent.trim(), '');
  if (d.meta.realism) L.push(`> 写实度 ${REALISM_LABEL[d.meta.realism]}${d.meta.material ? ` · 材质 ${d.meta.material}` : ''}`, '');
  const mode = modeOf(d.meta);
  if (mode !== 'replicate') {
    L.push(`## ${MODE_LABEL[mode]}${d.meta.origin ? `，分支自「${d.meta.origin.name}」（${d.meta.origin.id}${d.meta.origin.variant ? ' / ' + d.meta.origin.variant : ''}）` : ''}`, '');
    L.push(d.meta.deviation?.trim() ? d.meta.deviation.trim() : '（还没写偏离声明：保留原作什么、改掉什么）', '');
  }
  const core = section(s, 'Core Principle'); if (core) L.push('## 视频里能证明的：核心规则', '', core, '');
  const mat = section(s, 'Material Layers'); if (mat) L.push('## 视频里能证明的：材质层栈', '', mat, '');
  const dec = section(s, 'Design Decisions');
  const answered = (d.judgment ?? []).filter((j) => j.answer.trim());
  if (dec || answered.length) {
    L.push('## 用户决定的（视频证明不了，别当事实改回去）', '');
    if (dec) L.push(dec, '');
    for (const j of answered) L.push(`- **${j.q}** → ${j.answer}`);
    L.push('');
  }
  const open = (d.judgment ?? []).filter((j) => !j.answer.trim());
  if (open.length) {
    L.push('## 仍未定（接手的人要看一眼）', '');
    for (const j of open) L.push(`- [${JUDGMENT_KIND_LABEL[j.kind] ?? j.kind}] **${j.q}**  候选：${j.options.join(' / ')}。看 ${j.frame} 的${j.where}；验证：${j.verify}`);
    L.push('');
  }
  const craft = section(s, 'Craft Details'); if (craft) L.push('## 手感细节（不这么做就露馅）', '', craft, '');
  const inf = section(s, 'Inferred'); if (inf) L.push('## 模型推断的（没有证据、也不是你定的，可以推翻）', '', inf, '');
  if (d.tweakList.length) {
    L.push('## 可调参数（demo 里 <style id="yoink-tweaks">）', '');
    for (const t of d.tweakList) L.push(`- \`${t.key}\` — ${t.label}${t.type !== 'range' ? `（${t.type}）` : t.unit ? `（${t.unit}）` : ''}`);
    L.push('');
  }
  if (d.traits) {
    const t = d.traits;
    L.push('## 零件（traits.json，供移植 / 组合 / 家族用）', '');
    L.push(`- **结构**：${t.structure.outline}；布局：${t.structure.layout}；状态：${t.structure.states.join(' → ')}`);
    L.push(`- **材质**：${t.material.word} · ${t.material.realism}；灵魂：${t.material.soul}；光源：${t.material.light}`);
    for (const m of t.motion) L.push(`- **动效** ${m.name}：${m.trigger} → ${m.curve} ${m.duration}${m.depends_on ? `（依赖 ${m.depends_on}）` : ''}`);
    if (t.replaceable.length) L.push(`- **可替换**：${t.replaceable.map((r) => `\`${r.key}\` ${r.what}（${r.range}）`).join('；')}`);
    if (t.fixed.length) L.push('- **不可动**：', ...t.fixed.map((f) => `  - ${f}`));
    L.push('');
  }
  if (d.variants.length) { L.push('## 方案', '', ...d.variants.map((v) => `- ${v.name}（variants/${v.slug}/）`), ''); }
  return L.join('\n');
}

export async function saveJudgment(id: string, items: JudgmentItem[]) {
  await writeFile(path.join(patternDir(id), 'judgment.json'), JSON.stringify(items, null, 2) + '\n');
}

/** Insert or replace a `## Name` section in spec.md, placed before `## Technical Approach` (else before Tags, else at the end). */
export async function upsertSpecSection(id: string, name: string, body: string) {
  const p = path.join(patternDir(id), 'spec.md');
  let s = await readFile(p, 'utf8');
  const block = `## ${name}\n\n${body.trim()}\n\n`;
  const re = new RegExp('^## ' + name + '[^\\n]*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))', 'm');
  if (re.test(s)) s = s.replace(re, block);
  else if (/^## Technical Approach/m.test(s)) s = s.replace(/^## Technical Approach/m, block + '## Technical Approach');
  else if (/^## Tags/m.test(s)) s = s.replace(/^## Tags/m, block + '## Tags');
  else s = s.trimEnd() + '\n\n' + block;
  await writeFile(p, s);
}

// ─── leaf skills: one page per material / geometry / motion problem, grown from confirmed patterns ───
export const LEAF_KINDS = ['materials', 'geometry', 'motion'] as const;
export type LeafKind = typeof LEAF_KINDS[number];
export interface Leaf { kind: LeafKind; slug: string; file: string; match: string[]; text: string; builtin: boolean }
export const LEAF_ROOT = path.join(LIBRARY_ROOT, '_skills');

/** Read every leaf from the library (grown) and the app's seed folder (builtin). */
export async function listLeaves(seedDir: string): Promise<Leaf[]> {
  const out: Leaf[] = [];
  for (const [root, builtin] of [[seedDir, true], [LEAF_ROOT, false]] as const) {
    for (const kind of LEAF_KINDS) {
      const d = path.join(root, kind);
      if (!existsSync(d)) continue;
      for (const f of (await readdir(d)).filter((x) => x.endsWith('.md')).sort()) {
        const text = await readFile(path.join(d, f), 'utf8');
        const fm = text.match(/^---\n([\s\S]*?)\n---/);
        const match = fm?.[1].match(/^match:\s*\[(.*)\]/m)?.[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) ?? [];
        out.push({ kind, slug: f.replace(/\.md$/, ''), file: path.join(d, f), match: match.length ? match : [f.replace(/\.md$/, '')], text, builtin });
      }
    }
  }
  return out;
}

/** Leaves whose match words hit the pattern's material word or tags. At most `max`, library leaves win over builtins on a tie. */
export function leavesFor(meta: PatternMeta, leaves: Leaf[], max = 3): Leaf[] {
  const hay = [meta.material ?? '', ...meta.tags, ...(meta.tech_hints ?? []), meta.name].join(' ').toLowerCase();
  const scored = leaves.map((l) => ({ l, s: l.match.reduce((n, m) => n + (m && hay.includes(m.toLowerCase()) ? 1 : 0), 0) + (l.builtin ? 0 : 0.1) })).filter((x) => x.s >= 1).sort((a, b) => b.s - a.s);
  const seen = new Set<string>(); const out: Leaf[] = [];
  for (const { l } of scored) { const k = l.kind + '/' + l.slug; if (seen.has(k)) continue; seen.add(k); out.push(l); if (out.length >= max) break; }
  return out;
}

export async function writeLeaf(kind: LeafKind, slug: string, text: string): Promise<string> {
  const d = path.join(LEAF_ROOT, kind); await mkdir(d, { recursive: true });
  const f = path.join(d, slug.replace(/[^a-z0-9-]/g, '-') + '.md'); await writeFile(f, text.trim() + '\n'); return f;
}
