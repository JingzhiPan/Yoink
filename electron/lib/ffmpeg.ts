import { spawn } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { binary, shellEnv } from './paths.js';

function run(bin: string, args: string[], onLine?: (l: string) => void): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { env: shellEnv() });
    let stderr = '';
    p.stderr.on('data', (d) => { const s = d.toString(); stderr += s; onLine?.(s); });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

export async function probeDuration(video: string): Promise<number> {
  const ffprobe = binary('ffprobe');
  if (!ffprobe) return 0;
  const { stderr } = await new Promise<{ stderr: string; stdout: string }>((resolve) => {
    const p = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video], { env: shellEnv() });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', () => resolve({ stdout, stderr }));
  }).then((r) => ({ stderr: r.stdout || r.stderr, stdout: r.stdout }));
  const n = parseFloat(stderr.trim());
  return Number.isFinite(n) ? n : 0;
}

const MAX_FRAMES = 30;
const MIN_FRAMES = 6;
const SCALE = 'scale=min(1280\\,iw):-2';

/**
 * Extract key frames: scene-change detection first; if the video is too smooth
 * (few scene cuts, common for micro-interactions) fall back to evenly spaced frames.
 */
export async function extractFrames(
  video: string,
  outDir: string,
  log: (m: string) => void,
): Promise<{ count: number; duration: number }> {
  const ffmpeg = binary('ffmpeg');
  if (!ffmpeg) throw new Error('找不到 ffmpeg。请先安装：brew install ffmpeg');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const duration = await probeDuration(video);
  log(`视频时长 ${duration.toFixed(1)}s，开始抽关键帧…`);

  const pattern = path.join(outDir, 'frame-%03d.png');
  // Pass 1: scene detection
  let r = await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-i', video,
    '-vf', `select='gt(scene,0.08)+eq(n,0)',${SCALE}`,
    '-vsync', 'vfr', '-frames:v', String(MAX_FRAMES), pattern,
  ]);
  if (r.code !== 0) throw new Error('ffmpeg 抽帧失败：' + r.stderr.slice(-400));
  let count = (await readdir(outDir)).filter((f) => f.endsWith('.png')).length;
  log(`场景检测得到 ${count} 帧`);

  if (count < MIN_FRAMES) {
    // Pass 2: evenly spaced
    // ~1.2 frames per second for long clips so no scene gets skipped; 12 minimum, 30 cap
    const target = Math.min(30, Math.max(12, Math.round(duration * 1.2)));
    const fps = duration > 0 ? target / duration : 1;
    log(`帧数太少，改为均匀抽 ${target} 帧`);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    r = await run(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-i', video,
      '-vf', `fps=${fps},${SCALE}`, '-frames:v', String(target), pattern,
    ]);
    if (r.code !== 0) throw new Error('ffmpeg 抽帧失败：' + r.stderr.slice(-400));
    count = (await readdir(outDir)).filter((f) => f.endsWith('.png')).length;
  }
  log(`抽帧完成，共 ${count} 帧`);
  return { count, duration };
}

/**
 * Make a copy small enough for the browser upload bridge (hard 10 MB limit).
 * Tries progressively harsher settings until the file fits.
 */
export async function makeUploadCopy(video: string, out: string, maxBytes: number, log: (m: string) => void): Promise<string> {
  const ffmpeg = binary('ffmpeg');
  if (!ffmpeg) throw new Error('找不到 ffmpeg');
  const { stat } = await import('node:fs/promises');
  const size = (await stat(video)).size;
  if (size <= maxBytes) return video;
  const attempts = [
    { crf: 28, h: 1080 }, { crf: 32, h: 900 }, { crf: 36, h: 720 }, { crf: 40, h: 540 },
  ];
  for (const a of attempts) {
    log(`视频 ${(size / 1e6).toFixed(1)}MB 超过上传上限，压缩中（crf ${a.crf}, ≤${a.h}p）…`);
    const r = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video,
      '-vf', `scale=-2:'min(${a.h},ih)'`, '-c:v', 'libx264', '-crf', String(a.crf), '-preset', 'veryfast', '-an', '-movflags', '+faststart', out]);
    if (r.code !== 0) throw new Error('压缩失败：' + r.stderr.slice(-300));
    const s2 = (await stat(out)).size;
    log(`压缩后 ${(s2 / 1e6).toFixed(1)}MB`);
    if (s2 <= maxBytes) return out;
  }
  throw new Error('视频压不到 10MB 以下，试试先剪短一点');
}
