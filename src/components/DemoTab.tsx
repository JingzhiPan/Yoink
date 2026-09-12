import { useEffect, useRef, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';
import { api } from '../api';
import { NameDialog } from './NameDialog';
import { TweaksPanel } from './TweaksPanel';
import { RegionPicker } from './RegionPicker';
import { PointsOverlay, type PointsEdit } from './PointsOverlay';

const REFRESH_KINDS = new Set(['feedback', 'tweaks', 'demo', 'consolidate', 'screenshot']);

export function DemoTab({ d }: { d: PatternDetail }) {
  const { generateDemo, feedback, confirmDemo, saveVariant, restoreVariant, deleteVariant, forkPattern, updateMeta, previewVariant: preview, setPreviewVariant: setPreview } = useStore();
  const [frameEl, setFrameEl] = useState<HTMLIFrameElement | null>(null);
  const [dialog, setDialog] = useState<{ title: string; initial: string; label: string; run: (v: string, extra?: string) => Promise<void>; extra?: { label: string; placeholder: string } } | null>(null);
  const DEV = { label: '偏离声明：保留原作什么、改掉什么。之后每次修改都以它为边界。', placeholder: '例：保留扇形展开和收拢交互；材质从磨砂玻璃改成乳胶；删掉翻转；造型改成套子，储精囊和卷边是同一条轮廓' };
  const { outline, materialize } = useStore();
  const [shapeBrief, setShapeBrief] = useState('');
  const [showShape, setShowShape] = useState(false);
  const jobs = useStore((s) => s.jobs);
  const previewNow = useStore((s) => s.previewVariant);
  const targetSlug = previewNow ? d.variants.find((x) => x.index === previewNow)?.slug ?? null : null;
  // jobs are scoped to where you're working: main demo or one variant
  const running = runningJobsFor(jobs, d.meta.id, targetSlug).length > 0;
  const job = latestJobFor(jobs, d.meta.id, targetSlug);
  const [fb, setFb] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [picker, setPicker] = useState(false);
  const [crop, setCrop] = useState<string | null>(null);
  const [points, setPoints] = useState<PointsEdit | null>(null);
  const [scale, setScale] = useState(1);
    const openJudg = (d.judgment ?? []).filter((j) => !j.answer.trim());
  const id = d.meta.id;
  const done = d.meta.status === 'demo_done' || d.meta.status === 'skill_ready';

  const toastTimer = useRef<number>(0);
  const refresh = (msg = 'demo 已刷新') => {
    setReloadKey((k) => k + 1);
    setToast(msg); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };
  // any Claude job that touches the demo finishing → reload the iframe (and the tweaks read from it)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && job?.status === 'done' && REFRESH_KINDS.has(job.kind)) refresh(job.kind === 'tweaks' ? 'tweaks 已刷新' : 'demo 已刷新');
    wasRunning.current = running;
  }, [running, job?.status, job?.kind]);

  const shotName = (f: string) => f.split('/').pop() ?? f;
  const frameByName = (n: string | null) => (n ? d.frames.find((f) => shotName(f) === n) ?? null : null);
  const pairs = d.comparePairs?.length ? d.comparePairs : null;
  const variant = preview ? d.variants.find((x) => x.index === preview) ?? null : null;
  const vslug = variant?.slug;
  const log = variant ? variant.feedbackLog : d.feedbackLog;

  return (
    <>
        {!d.demoIndex ? (
          <>
            <h3>生成 demo</h3>
            <div className="callout">Claude Code 会读 verified spec 和关键帧，在 pattern 目录下写出一个自包含的 demo/index.html。通常要一两分钟。</div>
            <div className="row"><button className="primary" disabled={running || !d.spec} onClick={() => generateDemo(id)}>生成 demo</button></div>
          </>
        ) : (
          <>
            <div className="row">
              <h3>Demo 预览</h3><span className="spacer" />
              <button className="sm" onClick={() => api.showInFinder(d.demoIndex!)}>在 Finder 显示</button>
              <button className="sm" disabled={running} onClick={() => generateDemo(id)} title="丢掉当前 demo 重新生成">重新生成</button>
              {!done && <button className="primary sm" disabled={running} onClick={() => confirmDemo(id)} title="确认后自动截图比对，并把你的校正合并回 spec">确认 demo ✓</button>}
              {done && <span className="status" style={{ ['--sc' as string]: 'var(--s-done)' }}>已确认</span>}
            </div>
            <div className="demo-area">
              <div className="frame-col">
                <ScaledFrame src={api.fileUrl(preview ?? d.demoIndex) + '?r=' + reloadKey} onFrame={setFrameEl} onScale={setScale} />
                {points && <PointsOverlay iframe={frameEl} scale={scale} edit={points} />}
              </div>
              <TweaksPanel key={vslug ?? 'main'} iframe={frameEl} patternId={id} variant={vslug} running={running} loadKey={reloadKey} onReload={() => refresh()} hidden={(variant ? variant.hidden_tweaks : d.meta.hidden_tweaks) ?? []} onPoints={setPoints} pointsKey={points?.key ?? null} />
              {toast && <div className="toast" key={toast + reloadKey}>{toast}</div>}
            </div>
            {variant && (() => { const v = variant; return v ? (
              <div className="callout variant-bar">
                方案「{v.name}」是从当前 demo 分出去的独立工作区：下面的反馈和 tweaks 只改这个方案，不动主 demo。<span className="spacer" />
                <button className="ghost sm" onClick={() => setPreview(null)}>回到当前 demo</button>
                <button className="ghost sm" disabled={running} onClick={async () => { if (confirm(`用「${v.name}」覆盖当前 demo？建议先把当前 demo 另存。`)) { await restoreVariant(id, v.slug); refresh('已恢复为当前 demo'); } }}>恢复为当前</button>
                <button className="ghost sm" disabled={running} onClick={() => setDialog({ title: `从「${v.name}」分支成新 pattern`, initial: `${d.meta.name} · ${v.name}`, label: '分支', extra: DEV, run: (n, x) => forkPattern(id, n, v.slug, x) })}>分支</button>
                <button className="ghost sm danger" onClick={async () => { if (confirm(`删除方案「${v.name}」？`)) await deleteVariant(id, v.slug); }}>删</button>
              </div>) : null; })()}
            {!variant && (
              <div className={`shape-row ${d.meta.outline_ok === false ? 'pending' : ''}`}>
                <div className="row">
                  <h3>先定形，再上材质</h3>
                  <span className="hint">{d.meta.outline_ok === false ? '现在是剪纸版：拖 tweaks 里的角点把轮廓改到满意，再点"形状 OK，上材质"。' : '造型类改动别一层层打补丁：让它把每个主体重画成一条轮廓线，你拖点定形，材质再整体挂上去。'}</span>
                  <span className="spacer" />
                  {d.meta.outline_ok === false
                    ? <><button className="ghost sm" disabled={running} onClick={() => setShowShape(!showShape)}>再改形</button><button className="primary sm" disabled={running} onClick={() => materialize(id)}>形状 OK，上材质</button></>
                    : <button className="sm" disabled={running} onClick={() => setShowShape(!showShape)}>重画轮廓</button>}
                </div>
                {showShape && <div className="focus-box"><input autoFocus value={shapeBrief} onChange={(e) => setShapeBrief(e.target.value)} placeholder='要什么形：如"一个套子：长筒身、顶端小囊、底部卷边圆环，储精囊和筒身是同一条线"' onKeyDown={(e) => { if (e.key === 'Enter') { setShowShape(false); outline(id, shapeBrief); } }} /><div className="row"><button className="primary sm" disabled={running} onClick={() => { setShowShape(false); outline(id, shapeBrief); }}>重画（当前 demo 会自动另存）</button><button className="ghost sm" onClick={() => setShowShape(false)}>取消</button></div></div>}
              </div>
            )}
            <div className="row">
              <h3>{variant ? `调方案「${variant.name}」` : '调 demo'}</h3>
              {!variant && <label className="check" title="每次改完自动截图，让 Claude 对着参考图/关键帧自己检查一遍再交给你。没有视频的二创默认开"><input type="checkbox" checked={d.meta.self_check ?? (d.refs.length > 0 || d.frames.length === 0)} onChange={(e) => updateMeta(id, { self_check: e.target.checked })} /> 改完自己看一眼</label>}
              <span className="spacer" />
              {!variant && <button className="sm" disabled={running} onClick={() => setDialog({ title: '另存当前 demo 为方案', initial: `方案 ${d.variants.length + 1}`, label: '另存', run: (n) => saveVariant(id, n) })} title="复制一份当前 demo 作为独立方案，各改各的">另存当前 demo 为方案</button>}
              {!variant && <button className="sm" disabled={running} onClick={() => setDialog({ title: '分支成新 pattern', initial: d.meta.name + ' (variant)', label: '分支', extra: DEV, run: (n, x) => forkPattern(id, n, undefined, x) })}>分支成新 pattern</button>}
            </div>
            {!variant && openJudg.length > 0 && <div className="callout">还有 {openJudg.length} 个待判定问题没答（Spec 页）。答了再改 demo，通常比来回反馈省事。</div>}
            <div className="chat">
              <textarea placeholder={crop ? '这块对照图里，原图和 demo 差在哪？比如"顶边高光比 demo 厚，而且中间更亮"' : '直接说："动画太快了" "颜色偏蓝，应该更接近原视频的紫色" "hover 状态缺了个阴影"'} value={fb} onChange={(e) => setFb(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && fb.trim() && !running) { feedback(id, fb.trim(), vslug, crop ?? undefined); setFb(''); setCrop(null); } }} />
              <div className="chat-side">
                <button className="primary" disabled={!fb.trim() || running} onClick={() => { feedback(id, fb.trim(), vslug, crop ?? undefined); setFb(''); setCrop(null); }}>{variant ? '发给 Claude 改这个方案' : '发给 Claude 改'}</button>
                {crop ? <span className="crop-chip"><img src={api.fileUrl(crop)} alt="" />已附对照图<button className="ghost sm" onClick={() => setCrop(null)}>×</button></span>
                  : <button className="sm" disabled={!d.frames.length && !d.refs.length} onClick={() => setPicker(true)} title="在原始帧上框一块放大，让 Claude 对着像素改，而不是听你描述">框原图对照</button>}
              </div>
            </div>
            {log && <div className="row"><button className="ghost sm" onClick={() => setShowLog(!showLog)}>{showLog ? '收起' : '查看'}修改记录</button></div>}
            {showLog && log && <Markdown text={log} />}
          </>
        )}
        <JobLog job={job} />
        {d.demoIndex && !variant && (<>
          <h3>原始帧 vs demo 截图</h3>
          {d.demoScreenshots.length === 0 && <div className="hint">确认 demo 后会自动按 demo 里定义的每个状态各截一张，让 Claude 和原始帧配对比对。</div>}
          {pairs ? (
            <div className="pairs">
              <div className="ph">原始帧</div><div className="ph">demo 截图</div><div className="ph">差异</div>
              {pairs.map((p) => { const fr = frameByName(p.frame); const sh = d.demoScreenshots.find((s) => shotName(s) === p.shot); return (
                <div className="pair" key={p.shot}>
                  <div className="pf">{fr ? <img src={api.fileUrl(fr)} alt="" loading="lazy" title={p.frame ?? ''} /> : <div className="nomatch">原视频里没有对应状态</div>}</div>
                  <div className="pf">{sh && <img src={api.fileUrl(sh) + '?v=' + d.meta.demo_screenshot_count} alt="" loading="lazy" title={p.shot} />}</div>
                  <div className="pn"><b>{p.shot.replace(/^state-|\.png$/g, '')}</b>{p.note && p.note !== 'ok' ? <span>{p.note}</span> : <span className="ok">一致</span>}</div>
                </div>); })}
            </div>
          ) : d.demoScreenshots.length > 0 && (
            <div className="compare">
              <div className="col"><h4>原始帧</h4>{d.frames.map((f) => <img key={f} src={api.fileUrl(f)} alt="" loading="lazy" />)}</div>
              <div className="col"><h4>demo 截图</h4>{d.demoScreenshots.map((f) => <img key={f} src={api.fileUrl(f)} alt="" title={f.split('/').pop()} loading="lazy" />)}</div>
            </div>
          )}
          {d.demoCompare && (<><h3>比对报告</h3><Markdown text={d.demoCompare} /></>)}
        </>)}
        {picker && <RegionPicker frames={[...d.frames, ...d.refs]} onClose={() => setPicker(false)} onPick={async (f, r) => { setPicker(false); setCrop(await api.cropFrame(id, f, r)); }} />}
        {dialog && <NameDialog title={dialog.title} initial={dialog.initial} confirmLabel={dialog.label} extra={dialog.extra} onClose={() => setDialog(null)} onSubmit={async (n, x) => { setDialog(null); await dialog.run(n, x); }} />}
    </>
  );
}

/** The demo is authored at a fixed 960×600; scale it to fit whatever width the pane has. */
function ScaledFrame({ src, onFrame, onScale }: { src: string; onFrame?: (el: HTMLIFrameElement | null) => void; onScale?: (s: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => { const s = Math.min(1, el.clientWidth / 960); setScale(s); onScale?.(s); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // Scale by telling the page to zoom (via the bridge) instead of CSS-transforming the iframe:
  // a transformed iframe rasterises blur/backdrop filters and blend modes at the scaled size and looks soft and washed out.
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const sendZoom = () => { try { frameRef.current?.contentWindow?.postMessage({ type: 'yoink:zoom', zoom: scale }, '*'); } catch { /* */ } };
  useEffect(sendZoom, [scale]);
  return (
    <div className="iframewrap" ref={ref} style={{ height: Math.round(600 * scale), aspectRatio: 'auto' }}>
      <iframe key={src} ref={(el) => { frameRef.current = el; onFrame?.(el); }} src={src} sandbox="allow-scripts allow-same-origin" title="demo" onLoad={sendZoom} style={{ width: Math.round(960 * scale), height: Math.round(600 * scale) }} />
    </div>
  );
}
