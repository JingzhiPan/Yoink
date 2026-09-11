import { useEffect, useRef, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';
import { api } from '../api';
import { NameDialog } from './NameDialog';
import { TweaksPanel } from './TweaksPanel';

export function DemoTab({ d }: { d: PatternDetail }) {
  const { generateDemo, screenshot, feedback, confirmDemo, saveVariant, restoreVariant, deleteVariant, forkPattern, previewVariant: preview, setPreviewVariant: setPreview } = useStore();
  const [frameEl, setFrameEl] = useState<HTMLIFrameElement | null>(null);
  const [dialog, setDialog] = useState<{ title: string; initial: string; label: string; run: (v: string) => Promise<void> } | null>(null);
  const jobs = useStore((s) => s.jobs);
  const running = runningJobsFor(jobs, d.meta.id).length > 0;
  const job = latestJobFor(jobs, d.meta.id);
  const [fb, setFb] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const id = d.meta.id;
  const done = d.meta.status === 'demo_done' || d.meta.status === 'skill_ready';

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
              <button className="sm" onClick={() => setReloadKey((k) => k + 1)}>刷新</button>
              <button className="sm" onClick={() => api.showInFinder(d.demoIndex!)}>在 Finder 显示</button>
              <button className="sm" disabled={running} onClick={() => screenshot(id, true)}>截图比对</button>
              <button className="sm" disabled={running} onClick={() => generateDemo(id)} title="丢掉当前 demo 重新生成">重新生成</button>
              {!done && <button className="primary sm" disabled={running} onClick={() => confirmDemo(id)} title="确认后 Claude 会把你的校正合并回 spec 并精简">确认 demo ✓</button>}
              {done && <span className="status" style={{ ['--sc' as string]: 'var(--s-done)' }}>已确认</span>}
            </div>
            <ScaledFrame src={api.fileUrl(preview ?? d.demoIndex) + '?r=' + reloadKey} onFrame={setFrameEl} />
            {!preview && <TweaksPanel iframe={frameEl} patternId={id} running={running} loadKey={reloadKey} onReload={() => setReloadKey((k) => k + 1)} />}
            {preview && (() => { const v = d.variants.find((x) => x.index === preview); return v ? (
              <div className="callout variant-bar">
                正在预览方案「{v.name}」，当前 demo 未改动。<span className="spacer" />
                <button className="ghost sm" onClick={() => setPreview(null)}>回到当前 demo</button>
                <button className="ghost sm" disabled={running} onClick={async () => { if (confirm(`用「${v.name}」覆盖当前 demo？建议先把当前 demo 另存。`)) { await restoreVariant(id, v.slug); setReloadKey((k) => k + 1); } }}>恢复为当前</button>
                <button className="ghost sm" disabled={running} onClick={() => setDialog({ title: `从「${v.name}」分支成新 pattern`, initial: `${d.meta.name} · ${v.name}`, label: '分支', run: (n) => forkPattern(id, n, v.slug) })}>分支</button>
                <button className="ghost sm danger" onClick={async () => { if (confirm(`删除方案「${v.name}」？`)) await deleteVariant(id, v.slug); }}>删</button>
              </div>) : null; })()}
            <div className="row">
              <h3>调 demo</h3><span className="spacer" />
              <button className="sm" disabled={running} onClick={() => setDialog({ title: '另存当前 demo 为方案', initial: `方案 ${d.variants.length + 1}`, label: '另存', run: (n) => saveVariant(id, n) })}>另存当前 demo 为方案</button>
              <button className="sm" disabled={running} onClick={() => setDialog({ title: '分支成新 pattern', initial: d.meta.name + ' (variant)', label: '分支', run: (n) => forkPattern(id, n) })}>分支成新 pattern</button>
            </div>
            <div className="chat">
              <textarea placeholder='直接说："动画太快了" "颜色偏蓝，应该更接近原视频的紫色" "hover 状态缺了个阴影"' value={fb} onChange={(e) => setFb(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && fb.trim() && !running) { feedback(id, fb.trim()); setFb(''); } }} />
              <button className="primary" disabled={!fb.trim() || running} onClick={() => { feedback(id, fb.trim()); setFb(''); }}>发给 Claude 改</button>
            </div>
            {d.feedbackLog && <div className="row"><button className="ghost sm" onClick={() => setShowLog(!showLog)}>{showLog ? '收起' : '查看'}修改记录</button></div>}
            {showLog && d.feedbackLog && <Markdown text={d.feedbackLog} />}
          </>
        )}
        <JobLog job={job} />
        <h3>原始帧 vs demo 截图</h3>
        {d.demoScreenshots.length === 0 && <div className="hint">还没截图。点上方"截图比对"，会按 demo 里定义的每个状态各截一张，然后让 Claude 和原始帧比对。</div>}
        <div className="compare">
          <div className="col"><h4>原始帧</h4>{d.frames.map((f) => <img key={f} src={api.fileUrl(f)} alt="" loading="lazy" />)}</div>
          <div className="col"><h4>demo 截图</h4>{d.demoScreenshots.map((f) => <img key={f} src={api.fileUrl(f)} alt="" title={f.split('/').pop()} loading="lazy" />)}</div>
        </div>
        {d.demoCompare && (<><h3>比对报告</h3><Markdown text={d.demoCompare} /></>)}
        {dialog && <NameDialog title={dialog.title} initial={dialog.initial} confirmLabel={dialog.label} onClose={() => setDialog(null)} onSubmit={async (n) => { setDialog(null); await dialog.run(n); }} />}
    </>
  );
}

/** The demo is authored at a fixed 960×600; scale it to fit whatever width the pane has. */
function ScaledFrame({ src, onFrame }: { src: string; onFrame?: (el: HTMLIFrameElement | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 960)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <div className="iframewrap" ref={ref} style={{ height: 600 * scale, aspectRatio: 'auto' }}>
      <iframe key={src} ref={onFrame} src={src} sandbox="allow-scripts allow-same-origin" title="demo" style={{ width: 960, height: 600, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
    </div>
  );
}
