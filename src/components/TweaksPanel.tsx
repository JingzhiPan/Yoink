import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

interface Tweak { key: string; label: string; type: 'range' | 'color' | 'text'; min?: number; max?: number; step?: number; unit?: string; value: string }

const ROW_H = 54;

/**
 * Vertical tweaks column beside the demo. Talks to the demo iframe over postMessage
 * (the app and yoink:// are different origins; the bridge is injected by the protocol handler).
 * Rows that don't fit the column height are paged.
 */
export function TweaksPanel({ iframe, patternId, variant, running, loadKey, onReload, hidden = [] }: { iframe: HTMLIFrameElement | null; patternId: string; variant?: string; running: boolean; loadKey: number; onReload: () => void; hidden?: string[] }) {
  const { extractTweaks, applyTweaks, updateMeta, updateVariant } = useStore();
  const setHidden = (keys: string[]) => variant ? updateVariant(patternId, variant, { hidden_tweaks: keys }) : updateMeta(patternId, { hidden_tweaks: keys });
  const [focus, setFocus] = useState('');
  const [showFocus, setShowFocus] = useState(false);
  const [tweaks, setTweaks] = useState<Tweak[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(6);
  const listRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = listRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setPerPage(Math.max(1, Math.floor(el.clientHeight / ROW_H))));
    ro.observe(el); return () => ro.disconnect();
  }, [tweaks]);

  const set = (t: Tweak, raw: string) => {
    const v = t.type === 'range' ? `${raw}${t.unit ?? ''}` : raw;
    post({ type: 'yoink:set-tweak', key: t.key, value: v });
    setValues((s) => ({ ...s, [t.key]: v })); setDirty(true);
  };
  const reset = () => post({ type: 'yoink:reset-tweaks', keys: (tweaks ?? []).map((t) => t.key) });
  const num = (v: string) => parseFloat(v) || 0;
  const extract = async () => { setShowFocus(false); await extractTweaks(patternId, focus, variant); };
  const hide = (key: string) => setHidden([...hidden, key]);
  const unhideAll = () => setHidden([]);
  const focusBox = (
    <div className="focus-box">
      <input autoFocus value={focus} onChange={(e) => setFocus(e.target.value)} placeholder='你想调什么？如"展开速度、竖线断开时机"，空着就按反馈记录挑' onKeyDown={(e) => { if (e.key === 'Enter') extract(); }} />
      <div className="row"><button className="primary sm" disabled={running} onClick={extract}>抽取</button><button className="ghost sm" onClick={() => setShowFocus(false)}>取消</button></div>
    </div>
  );

  if (!tweaks) {
    return (
      <div className="tweaks col empty">
        <h3>Tweaks</h3>
        {showFocus ? focusBox : <>
          <span className="hint">这个 demo 还没有 tweaks 清单。让 Claude 把你关心的参数抽成可调变量。</span>
          <button className="sm" disabled={running} onClick={() => setShowFocus(true)}>抽取 tweaks</button>
        </>}
      </div>
    );
  }
  const visible = tweaks.filter((t) => !hidden.includes(t.key));
  const pages = Math.max(1, Math.ceil(visible.length / perPage));
  const cur = Math.min(page, pages - 1);
  const slice = visible.slice(cur * perPage, cur * perPage + perPage);
  return (
    <div className="tweaks col">
      <div className="row"><h3>Tweaks · {visible.length}</h3><span className="spacer" />
        <button className="ghost sm" onClick={reset} disabled={!dirty} title="回到写入前的值">重置</button>
        <button className="ghost sm" disabled={running} onClick={() => setShowFocus(!showFocus)} title="告诉它你想调什么，重新抽">重抽</button>
      </div>
      {showFocus && focusBox}
      <div className="tweak-list" ref={listRef}>
        {slice.map((t) => (
          <label key={t.key} className="tweak v">
            <span className="tl" title={t.key}><span className="tn">{t.label || t.key}</span>{t.type !== 'text' && <span className="tv">{values[t.key]}</span>}<button className="hide" title="藏掉这个参数" onClick={(e) => { e.preventDefault(); hide(t.key); }}>×</button></span>
            {t.type === 'range' && <input type="range" min={t.min ?? 0} max={t.max ?? 100} step={t.step ?? 1} value={num(values[t.key] ?? '')} onChange={(e) => set(t, e.target.value)} />}
            {t.type === 'color' && <input type="color" value={toHex(values[t.key] ?? '#000000')} onChange={(e) => set(t, e.target.value)} />}
            {t.type === 'text' && <input type="text" value={values[t.key] ?? ''} onChange={(e) => set(t, e.target.value)} />}
          </label>
        ))}
      </div>
      <div className="row tweak-foot">
        {pages > 1 && <span className="pager"><button className="ghost sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹</button>{cur + 1}/{pages}<button className="ghost sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>›</button></span>}
        {hidden.length > 0 && <button className="ghost sm" onClick={unhideAll}>已藏 {hidden.length}，全部显示</button>}
        <span className="spacer" />
        <button className="primary sm" disabled={!dirty || running} onClick={async () => { await applyTweaks(patternId, values, variant); setDirty(false); onReload(); }}>写回 demo</button>
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
