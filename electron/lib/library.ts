import { mkdir, readdir, readFile, writeFile, copyFile, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT } from './paths.js';
import type { PatternMeta, PatternDetail, PatternStatus } from '../../shared/types.js';

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

export async function getPattern(id: string): Promise<PatternDetail> {
  const dir = patternDir(id);
  const meta = await readMeta(id);
  const videoCandidates = (await readdir(dir)).filter((f) => /^source\.(mp4|mov|webm|m4v|gif|mkv)$/i.test(f));
  const demoIndex = path.join(dir, 'demo', 'index.html');
  return {
    meta, dir,
    videoPath: videoCandidates[0] ? path.join(dir, videoCandidates[0]) : null,
    frames: await listPngs(path.join(dir, 'frames')),
    demoScreenshots: await listPngs(path.join(dir, 'demo-screenshots')),
    rawSpec: await readOpt(path.join(dir, 'raw-spec.md')),
    spec: await readOpt(path.join(dir, 'spec.md')),
    demoIndex: existsSync(demoIndex) ? demoIndex : null,
    demoCompare: await readOpt(path.join(dir, 'demo-compare.md')),
    skillMd: await readOpt(path.join(dir, 'skill', 'SKILL.md')),
    skillFiles: await walk(path.join(dir, 'skill')),
    feedbackLog: await readOpt(path.join(dir, 'demo-feedback.md')),
  };
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
