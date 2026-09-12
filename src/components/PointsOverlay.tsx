import { useEffect, useRef, useState } from 'react';

export interface PointsEdit { key: string; label: string; target: string; value: string; set: (v: string) => void }

const parse = (v: string) => v.split(',').map((p) => p.trim().split(/\s+/).map(parseFloat)).filter((a) => a.length === 2 && a.every((n) => !isNaN(n))) as [number, number][];
const fmt = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(', ');

/** Draggable handles over the demo iframe for a `points` tweak; coordinates are % of the target element's box. */
export function PointsOverlay({ iframe, scale, edit }: { iframe: HTMLIFrameElement | null; scale: number; edit: PointsEdit }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pts, setPts] = useState<[number, number][]>(() => parse(edit.value));
  const dragging = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { setPts(parse(edit.value)); }, [edit.key]);
  useEffect(() => {
    if (!iframe) return;
    const onMsg = (e: MessageEvent) => { if (e.source === iframe.contentWindow && e.data?.type === 'yoink:rect' && e.data.selector === edit.target) setRect(e.data.rect); };
    window.addEventListener('message', onMsg);
    const ask = () => { try { iframe.contentWindow?.postMessage({ type: 'yoink:get-rect', selector: edit.target }, '*'); } catch { /* */ } };
    ask(); const t = setInterval(ask, 800);
    return () => { window.removeEventListener('message', onMsg); clearInterval(t); };
  }, [iframe, edit.target]);
  if (!rect) return <div className="points-hint">找不到 {edit.target}，先把 demo 切到该元素可见的状态</div>;
  const toPx = (p: [number, number]) => ({ left: (rect.x + (p[0] / 100) * rect.w) * scale, top: (rect.y + (p[1] / 100) * rect.h) * scale });
  const move = (e: React.MouseEvent) => {
    if (dragging.current === null || !wrap.current) return;
    const b = wrap.current.getBoundingClientRect();
    const x = ((e.clientX - b.left) / scale - rect.x) / rect.w * 100, y = ((e.clientY - b.top) / scale - rect.y) / rect.h * 100;
    const next = pts.map((p, i) => (i === dragging.current ? [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number] : p));
    setPts(next); edit.set(fmt(next));
  };
  return (
    <div className="points-overlay" ref={wrap} onMouseMove={move} onMouseUp={() => (dragging.current = null)} onMouseLeave={() => (dragging.current = null)}>
      <div className="points-box" style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale }} />
      <svg className="points-poly" width="100%" height="100%"><polygon points={pts.map((p) => { const q = toPx(p); return `${q.left},${q.top}`; }).join(' ')} /></svg>
      {pts.map((p, i) => <div key={i} className="point" style={toPx(p)} onMouseDown={(e) => { e.preventDefault(); dragging.current = i; }} title={`${i + 1}: ${p[0]}% ${p[1]}%`} />)}
      <div className="points-label">{edit.label} · 拖角点</div>
    </div>
  );
}
