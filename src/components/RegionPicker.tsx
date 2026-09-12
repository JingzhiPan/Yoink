import { useRef, useState } from 'react';
import { api } from '../api';

type Rect = { x: number; y: number; w: number; h: number };

/** Pick a frame, drag a box on it; the crop gets attached to the next feedback so Claude compares against pixels, not prose. */
export function RegionPicker({ frames, onClose, onPick }: { frames: string[]; onClose: () => void; onPick: (frame: string, r: Rect) => void }) {
  const [frame, setFrame] = useState(frames[Math.floor(frames.length / 2)] ?? frames[0]);
  const [rect, setRect] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const frac = (e: React.MouseEvent) => { const b = ref.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
  const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <h2>框一块原图给 Claude 对照</h2>
        <p className="sub">选一帧，在图上拖出区域。会放大裁下来，连同你的文字一起发。</p>
        <div className="strip">
          {frames.map((f) => <figure key={f} className={f === frame ? 'on' : ''} onClick={() => { setFrame(f); setRect(null); }}><img src={api.fileUrl(f)} alt="" loading="lazy" /></figure>)}
        </div>
        <div className="pick-area" ref={ref}
          onMouseDown={(e) => { const p = frac(e); setDrag(p); setRect({ ...p, w: 0, h: 0 }); }}
          onMouseMove={(e) => { if (drag) setRect(norm(drag, frac(e))); }}
          onMouseUp={(e) => { if (drag) { setRect(norm(drag, frac(e))); setDrag(null); } }}>
          <img src={api.fileUrl(frame)} alt="" draggable={false} />
          {rect && rect.w > 0 && <div className="pick-rect" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="spacer" />
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={!rect || rect.w < 0.02 || rect.h < 0.02} onClick={() => rect && onPick(frame, rect)}>附到反馈</button>
        </div>
      </div>
    </div>
  );
}
