import { useEffect, useRef, useState } from 'react';

/** Electron has no window.prompt(); this is the in-app replacement. */
export function NameDialog({ title, initial, confirmLabel = '确定', onSubmit, onClose }: { title: string; initial: string; confirmLabel?: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input ref={ref} style={{ width: '100%', marginTop: 10 }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSubmit(v.trim()); if (e.key === 'Escape') onClose(); }} />
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" disabled={!v.trim()} onClick={() => onSubmit(v.trim())}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
