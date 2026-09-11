import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { StatusBadge } from './common';
import { SpecTab } from './SpecTab';
import { DemoTab } from './DemoTab';
import { SkillTab } from './SkillTab';
import { I } from './icons';
import { api } from '../api';

type Tab = 'spec' | 'demo' | 'skill';

export function DetailPanel() {
  const d = useStore((s) => s.current);
  const { updateMeta, deletePattern } = useStore();
  const [tab, setTab] = useState<Tab>('spec');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!d) return;
    setTab((d.meta.status === 'skill_ready' || d.meta.status === 'demo_done') ? 'skill' : d.meta.status === 'demo_wip' ? 'demo' : 'spec');
  }, [d?.meta.id]);
  // the demo iframe steals focus on load and scrolls the panel; pin it back to the top
  useEffect(() => { const t = setTimeout(() => ref.current?.scrollTo({ top: 0 }), 300); const t2 = setTimeout(() => ref.current?.scrollTo({ top: 0 }), 1200); return () => { clearTimeout(t); clearTimeout(t2); }; }, [d?.meta.id, tab]);
  if (!d) return <aside className="panel drag"><div className="empty">Select a pattern to see its spec, demo and skill.</div></aside>;
  const hasSpec = !!d.spec;
  const skillUnlocked = ['demo_done', 'skill_ready'].includes(d.meta.status);
  const cover = d.demoScreenshots[0] ?? d.frames[0];
  return (
    <aside className="panel" key={d.meta.id} ref={ref}>
      <div className="cover drag">{cover ? <img src={api.fileUrl(cover)} alt="" /> : 'no frames'}</div>
      <div className="title-row">
        <h1><input key={d.meta.name} defaultValue={d.meta.name} onBlur={(e) => e.target.value !== d.meta.name && updateMeta(d.meta.id, { name: e.target.value })} /></h1>
        <StatusBadge status={d.meta.status} />
      </div>
      <div className="row head-row">
        <span className="meta-line">{d.meta.id} · {d.meta.video_duration_sec}s · {d.meta.frame_count} frames · {d.meta.input_method || '—'}</span>
        <span className="spacer" />
        <button className="ghost sm" onClick={() => api.showInFinder(d.dir)}>Finder</button>
        <button className="ghost sm danger" onClick={() => { if (confirm(`删除 ${d.meta.name}？整个文件夹都会删掉。`)) deletePattern(d.meta.id); }}>删除</button>
      </div>
      <div className="tags">{d.meta.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      <div className="tabs">
        <button className={tab === 'spec' ? 'on' : ''} onClick={() => setTab('spec')}>Spec</button>
        <button className={tab === 'demo' ? 'on' : ''} disabled={!hasSpec} onClick={() => setTab('demo')}>Demo</button>
        <button className={tab === 'skill' ? 'on' : ''} disabled={!skillUnlocked} onClick={() => setTab('skill')} title={skillUnlocked ? '' : '确认 demo 后解锁'}>Skill</button>
      </div>
      {tab === 'spec' && <SpecTab d={d} />}
      {tab === 'demo' && <DemoTab d={d} />}
      {tab === 'skill' && <SkillTab d={d} />}
      <div className="actions">
        <button onClick={() => api.showInFinder(d.skillMd ? `${d.dir}/skill` : d.dir)}>{I.pencil} Open in Finder</button>
        <button className="primary" disabled={!skillUnlocked} onClick={() => setTab('skill')}>View Skill →</button>
      </div>
    </aside>
  );
}
