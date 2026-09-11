import { useEffect, useRef, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';
import { api } from '../api';

export function DemoTab({ d }: { d: PatternDetail }) {
  const { generateDemo, screenshot, feedback, confirmDemo } = useStore();
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
              {!done && <button className="primary sm" disabled={running} onClick={() => confirmDemo(id)}>确认 demo ✓</button>}
              {done && <span className="status" style={{ ['--sc' as string]: 'var(--s-done)' }}>已确认</span>}
            </div>
            <ScaledFrame src={api.fileUrl(d.demoIndex) + '?r=' + reloadKey} />
            <h3 style={{ marginTop: 6 }}>调 demo</h3>
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
    </>
  );
}

/** The demo is authored at a fixed 960×600; scale it to fit whatever width the pane has. */
function ScaledFrame({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 960)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <div className="iframewrap" ref={ref} style={{ height: 600 * scale, aspectRatio: 'auto' }}>
      <iframe key={src} src={src} sandbox="allow-scripts allow-same-origin" title="demo" style={{ width: 960, height: 600, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
    </div>
  );
}
