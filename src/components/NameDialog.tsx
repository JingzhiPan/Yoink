import { useEffect, useRef, useState } from 'react';

/** Electron has no window.prompt(); this is the in-app replacement. */
export function NameDialog({ title, initial, confirmLabel = '确定', onSubmit, onClose, extra }: { title: string; initial: string; confirmLabel?: string; onSubmit: (v: string, extra?: string) => void; onClose: () => void; extra?: { label: string; placeholder: string; initial?: string } }) {
  const [v, setV] = useState(initial);
  const [x, setX] = useState(extra?.initial ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input ref={ref} style={{ width: '100%', marginTop: 10 }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSubmit(v.trim(), x.trim()); if (e.key === 'Escape') onClose(); }} />
        {extra && <><div className="hint" style={{ marginTop: 12 }}>{extra.label}</div><textarea style={{ width: '100%', marginTop: 6, minHeight: 90 }} placeholder={extra.placeholder} value={x} onChange={(e) => setX(e.target.value)} /></>}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" disabled={!v.trim()} onClick={() => onSubmit(v.trim(), x.trim())}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
