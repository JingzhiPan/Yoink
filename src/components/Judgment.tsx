import { useState } from 'react';
import type { JudgmentItem } from '../../shared/types';
import { JUDGMENT_KIND_LABEL } from '../../shared/types';
import { api } from '../api';

/** The "only a human can decide this" list. Pick an option or type your own; answers feed the demo prompt and the handoff. */
export function Judgment({ items, frames, onSave }: { items: JudgmentItem[]; frames: string[]; onSave: (items: JudgmentItem[]) => void }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const frameOf = (name: string) => frames.find((f) => f.endsWith('/' + name)) ?? null;
  const set = (id: string, answer: string) => onSave(items.map((j) => (j.id === id ? { ...j, answer } : j)));
  const open = items.filter((j) => !j.answer.trim()).length;
  return (
    <div className="judgment">
      <div className="row"><h3>待你判定 · {open ? `还剩 ${open}` : '全部定了'}</h3><span className="hint">这些是帧看不出来的，你不答就按第一个候选做，并在 demo 里留开关。</span></div>
      {items.map((j) => {
        const fr = frameOf(j.frame);
        return (
          <div key={j.id} className={`jitem ${j.answer ? 'done' : ''}`}>
            <div className="jq"><span className="jkind">{JUDGMENT_KIND_LABEL[j.kind]}</span>{j.q}</div>
            <div className="jopts">
              {j.options.map((o) => <button key={o} className={`sm ${j.answer === o ? 'on' : ''}`} onClick={() => set(j.id, j.answer === o ? '' : o)}>{o}</button>)}
              <input placeholder="或者自己写…" value={custom[j.id] ?? (j.options.includes(j.answer) ? '' : j.answer)} onChange={(e) => setCustom({ ...custom, [j.id]: e.target.value })} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== j.answer) set(j.id, e.target.value.trim()); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            </div>
            <div className="jmeta">
              {fr ? <button className="ghost sm" onClick={() => setZoom(fr)}>看 {j.frame}</button> : <span>{j.frame}</span>}
              {j.where && <span>· {j.where}</span>}
              {j.verify && <span>· 验证：{j.verify}</span>}
            </div>
          </div>
        );
      })}
      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={api.fileUrl(zoom)} alt="" /></div>}
    </div>
  );
}
