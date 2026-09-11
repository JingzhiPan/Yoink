import { useStore } from '../store';
import { StatusBadge } from './common';
import { Markdown } from './Markdown';
import { api } from '../api';

/** Read-only preview shown beside the library grid. No editing here; "进入工作区" for that. */
export function BrowsePanel() {
  const { selected: d, select, open } = useStore();
  if (!d) return null;
  const cover = d.cover ?? d.demoScreenshots[0] ?? d.frames[0];
  return (
    <aside className="panel browse-panel">
      <div className="row"><span className="spacer" /><button className="ghost sm" onClick={() => select(null)}>关闭</button></div>
      <div className="cover">{cover ? <img src={api.fileUrl(cover) + '?v=' + d.meta.demo_screenshot_count} alt="" /> : 'no frames'}</div>
      <div className="title-row"><h1>{d.meta.name}</h1><StatusBadge status={d.meta.status} /></div>
      <div className="meta-line">{d.meta.id} · {d.meta.video_duration_sec}s · {d.meta.frame_count} frames · {d.meta.category} · {d.meta.complexity}</div>
      <div className="tags">{d.meta.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      {d.meta.tech_hints.length > 0 && <div className="hint">{d.meta.tech_hints.join(' · ')}</div>}
      {d.meta.notes && <div className="hint">{d.meta.notes}</div>}
      <button className="primary" onClick={() => open(d.meta.id)}>进入工作区 →</button>
      {d.demoIndex && (<><h3>Demo</h3><div className="iframewrap browse-frame"><iframe src={api.fileUrl(d.demoIndex)} sandbox="allow-scripts allow-same-origin" title="demo" /></div></>)}
      {d.variants.length > 0 && (<><h3>方案 · {d.variants.length}</h3><div className="hint">{d.variants.map((v) => v.name).join(' · ')}</div></>)}
      {d.spec ? (<><h3>Spec</h3><Markdown text={d.spec} /></>) : d.rawSpec ? (<><h3>Raw spec</h3><Markdown text={d.rawSpec} /></>) : <div className="hint">还没有 spec。</div>}
    </aside>
  );
}
