import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';

interface Tweak { key: string; label: string; type: 'range' | 'color' | 'text'; min?: number; max?: number; step?: number; unit?: string }

/**
 * Reads window.__yoink.tweaks from the demo iframe, renders controls, and writes
 * values live onto the iframe's :root. "写回 demo" persists them into index.html.
 */
export function TweaksPanel({ iframe, patternId, running, loadKey }: { iframe: HTMLIFrameElement | null; patternId: string; running: boolean; loadKey: number }) {
  const { extractTweaks, applyTweaks } = useStore();
  const [tweaks, setTweaks] = useState<Tweak[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const read = useCallback(() => {
    const win = iframe?.contentWindow as any;
    const doc = iframe?.contentDocument;
    const list: Tweak[] | undefined = win?.__yoink?.tweaks;
    if (!doc || !Array.isArray(list) || list.length === 0) { setTweaks(null); return; }
    const cs = getComputedStyle(doc.documentElement);
    const v: Record<string, string> = {};
    for (const t of list) v[t.key] = cs.getPropertyValue(t.key).trim();
    setTweaks(list); setValues(v); setDirty(false);
  }, [iframe]);

  useEffect(() => {
    if (!iframe) return;
    const t1 = setTimeout(read, 500); const t2 = setTimeout(read, 1500);
    iframe.addEventListener('load', read);
    return () => { clearTimeout(t1); clearTimeout(t2); iframe.removeEventListener('load', read); };
  }, [iframe, loadKey, read]);

  const set = (t: Tweak, raw: string) => {
    const v = t.type === 'range' ? `${raw}${t.unit ?? ''}` : raw;
    iframe?.contentDocument?.documentElement.style.setProperty(t.key, v);
    setValues((s) => ({ ...s, [t.key]: v })); setDirty(true);
  };
  const reset = () => { const root = iframe?.contentDocument?.documentElement; if (root) for (const t of tweaks ?? []) root.style.removeProperty(t.key); read(); };
  const num = (v: string) => parseFloat(v) || 0;

  if (!tweaks) {
    return (
      <div className="tweaks empty">
        <span className="hint">这个 demo 还没有 tweaks 清单。</span>
        <button className="sm" disabled={running} onClick={() => extractTweaks(patternId)} title="让 Claude 把时长、颜色、尺寸、弹簧参数抽成可调变量">抽取 tweaks</button>
      </div>
    );
  }
  return (
    <div className="tweaks">
      <div className="row"><h3>Tweaks · {tweaks.length}</h3><span className="spacer" />
        <button className="ghost sm" onClick={reset} disabled={!dirty}>重置</button>
        <button className="ghost sm" disabled={running} onClick={() => extractTweaks(patternId)} title="重新抽取">重抽</button>
        <button className="primary sm" disabled={!dirty || running} onClick={async () => { await applyTweaks(patternId, values); setDirty(false); }}>写回 demo</button>
      </div>
      <div className="tweak-grid">
        {tweaks.map((t) => (
          <label key={t.key} className="tweak">
            <span className="tl">{t.label || t.key}</span>
            {t.type === 'range' && <>
              <input type="range" min={t.min ?? 0} max={t.max ?? 100} step={t.step ?? 1} value={num(values[t.key] ?? '')} onChange={(e) => set(t, e.target.value)} />
              <span className="tv">{values[t.key]}</span>
            </>}
            {t.type === 'color' && <>
              <input type="color" value={toHex(values[t.key] ?? '#000000')} onChange={(e) => set(t, e.target.value)} />
              <span className="tv">{values[t.key]}</span>
            </>}
            {t.type === 'text' && <input type="text" value={values[t.key] ?? ''} onChange={(e) => set(t, e.target.value)} />}
          </label>
        ))}
      </div>
    </div>
  );
}

function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return '#000000';
}
