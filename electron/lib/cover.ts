import { nativeImage } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Pick a representative image and crop it to its subject.
 * Background = the most common colour along the image border; the subject is the
 * bounding box of pixels that differ from it. Falls back to the whole image.
 */
export async function makeCover(candidates: string[], outPath: string): Promise<string | null> {
  const src = candidates.find(Boolean);
  if (!src) return null;
  const img = nativeImage.createFromPath(src);
  if (img.isEmpty()) return null;
  const { width: W, height: H } = img.getSize();
  const buf = img.toBitmap(); // BGRA
  const px = (x: number, y: number) => { const i = (y * W + x) * 4; return [buf[i + 2], buf[i + 1], buf[i]]; };

  // background: most common quantised colour on the border
  const counts = new Map<string, number>();
  const step = Math.max(1, Math.floor(Math.max(W, H) / 200));
  for (let x = 0; x < W; x += step) for (const y of [0, H - 1]) bump(counts, px(x, y));
  for (let y = 0; y < H; y += step) for (const x of [0, W - 1]) bump(counts, px(x, y));
  const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = bgKey.split(',').map(Number);
  const TOL = 40;
  const isBg = (c: number[]) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) < TOL;

  // bounding box of non-background pixels (coarse scan), ignoring thin bars at the very top/bottom
  let minX = W, minY = H, maxX = -1, maxY = -1;
  const s = Math.max(1, Math.floor(Math.max(W, H) / 400));
  for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
    if (!isBg(px(x, y))) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  let crop = { x: 0, y: 0, width: W, height: H };
  if (maxX > minX && maxY > minY) {
    const bw = maxX - minX, bh = maxY - minY;
    // only crop when the subject is clearly smaller than the canvas
    if (bw < W * 0.9 || bh < H * 0.9) {
      const pad = Math.round(Math.max(bw, bh) * 0.18) + 16;
      let x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
      let x1 = Math.min(W, maxX + pad), y1 = Math.min(H, maxY + pad);
      // widen to a 16:10 box around the subject for the card cover
      const targetRatio = 16 / 10;
      let cw = x1 - x0, ch = y1 - y0;
      if (cw / ch < targetRatio) { const need = ch * targetRatio - cw; x0 = Math.max(0, x0 - need / 2); x1 = Math.min(W, x0 + ch * targetRatio); x0 = Math.max(0, x1 - ch * targetRatio); }
      else { const need = cw / targetRatio - ch; y0 = Math.max(0, y0 - need / 2); y1 = Math.min(H, y0 + cw / targetRatio); y0 = Math.max(0, y1 - cw / targetRatio); }
      crop = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
    }
  }
  const out = img.crop(crop).resize({ width: 640 });
  await writeFile(outPath, out.toPNG());
  return outPath;
}

function bump(m: Map<string, number>, c: number[]) { const k = c.map((v) => Math.round(v / 16) * 16).join(','); m.set(k, (m.get(k) ?? 0) + 1); }
export const coverPath = (dir: string) => path.join(dir, 'cover.png');
