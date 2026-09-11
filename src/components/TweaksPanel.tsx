import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';

interface Tweak { key: string; label: string; type: 'range' | 'color' | 'text'; min?: number; max?: number; step?: number; unit?: string; value: string }

/**
 * Talks to the demo iframe over postMessage (the app and yoink:// are different origins).
 * The bridge script is injected by the yoink:// protocol handler in main.
 */
export function TweaksPanel({ iframe, patternId, running, loadKey, onReload }: { iframe: HTMLIFrameElement | null; patternId: string; running: boolean; loadKey: number; onReload: () => void }) {
  const { extractTweaks, applyTweaks } = useStore();
  const [tweaks, setTweaks] = useState<Tweak[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const post = useCallback((msg: unknown) => { try { iframe?.contentWindow?.postMessage(msg, '*'); } catch { /* */ } }, [iframe]);

  useEffect(() => {
    if (!iframe) return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.data?.type !== 'yoink:tweaks') return;
      const list: Tweak[] = e.data.tweaks ?? [];
      if (!list.length) { setTweaks(null); return; }
      setTweaks(list); setValues(Object.fromEntries(list.map((t) => [t.key, t.value]))); setDirty(false);
    };
    window.addEventListener('message', onMsg);
    const ask = () => post({ type: 'yoink:get-tweaks' });
    const t1 = setTimeout(ask, 400); const t2 = setTimeout(ask, 1500);
    iframe.addEventListener('load', ask);
    return () => { window.removeEventListener('message', onMsg); clearTimeout(t1); clearTimeout(t2); iframe.removeEventListener('load', ask); };
  }, [iframe, loadKey, post]);

  const set = (t: Tweak, raw: string) => {
    const v = t.type === 'range' ? `${raw}${t.unit ?? ''}` : raw;
    post({ type: 'yoink:set-tweak', key: t.key, value: v });
    setValues((s) => ({ ...s, [t.key]: v })); setDirty(true);
  };
  const reset = () => post({ type: 'yoink:reset-tweaks', keys: (tweaks ?? []).map((t) => t.key) });
  const num = (v: string) => parseFloat(v) || 0;
  const extract = async () => { await extractTweaks(patternId); onReload(); };

  if (!tweaks) {
    return (
      <div className="tweaks empty">
        <span className="hint">这个 demo 还没有 tweaks 清单。</span>
        <button className="sm" disabled={running} onClick={extract} title="让 Claude 把时长、颜色、尺寸、弹簧参数抽成可调变量">抽取 tweaks</button>
      </div>
    );
  }
  return (
    <div className="tweaks">
      <div className="row"><h3>Tweaks · {tweaks.length}</h3><span className="spacer" />
        <button className="ghost sm" onClick={reset} disabled={!dirty}>重置</button>
        <button className="ghost sm" disabled={running} onClick={extract} title="重新抽取">重抽</button>
        <button className="primary sm" disabled={!dirty || running} onClick={async () => { await applyTweaks(patternId, values); setDirty(false); }}>写回 demo</button>
      </div>
      <div className="tweak-grid">
        {tweaks.map((t) => (
          <label key={t.key} className="tweak">
            <span className="tl" title={t.key}>{t.label || t.key}</span>
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
