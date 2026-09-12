import { useState, useEffect, useRef } from 'react';
import { useStore, runningJobsFor } from '../store';
import { TAG_FACET_LABEL } from '../../shared/types';
import { StatusBadge } from './common';
import { SpecTab } from './SpecTab';
import { DemoTab } from './DemoTab';
import { SkillTab } from './SkillTab';
import { HandoffTab } from './HandoffTab';
import { I } from './icons';
import { api } from '../api';

type Tab = 'spec' | 'demo' | 'skill' | 'handoff';

export function DetailPanel() {
  const d = useStore((s) => s.current);
  const { updateMeta, deletePattern, refreshCover, retag } = useStore();
  const jobs = useStore((s) => s.jobs);
  const [tab, setTab] = useState<Tab>('spec');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!d) return;
    setTab((d.meta.status === 'skill_ready' || d.meta.status === 'demo_done') ? 'skill' : d.meta.status === 'demo_wip' ? 'demo' : 'spec');
  }, [d?.meta.id]);
  // the demo iframe steals focus on load and scrolls the panel; pin it back to the top
  useEffect(() => { const t = setTimeout(() => ref.current?.scrollTo({ top: 0 }), 300); const t2 = setTimeout(() => ref.current?.scrollTo({ top: 0 }), 1200); return () => { clearTimeout(t); clearTimeout(t2); }; }, [d?.meta.id, tab]);
  if (!d) return null;
  const hasSpec = !!d.spec;
  const skillUnlocked = ['demo_done', 'skill_ready'].includes(d.meta.status);
  return (
    <main className="panel workspace" key={d.meta.id} ref={ref}>
      <div className="title-row drag">
        <h1><input key={d.meta.name} defaultValue={d.meta.name} onBlur={(e) => e.target.value !== d.meta.name && updateMeta(d.meta.id, { name: e.target.value })} /></h1>
        <StatusBadge status={d.meta.status} />
      </div>
      <div className="row head-row">
        <span className="meta-line">{d.meta.id} · {d.meta.video_duration_sec}s · {d.meta.frame_count} frames · {d.meta.input_method || '—'}</span>
        <span className="spacer" />
        <button className="ghost sm" onClick={() => refreshCover(d.meta.id)} title="没有 demo 截图就先截一轮，再按主体重裁封面">刷新封面</button>
        <button className="ghost sm" onClick={() => api.showInFinder(d.dir)}>Finder</button>
        <button className="ghost sm danger" onClick={() => { if (confirm(`删除 ${d.meta.name}？整个文件夹都会删掉。`)) deletePattern(d.meta.id); }}>删除</button>
      </div>
      <div className="tags">
        {d.meta.tag_facets
          ? (Object.keys(TAG_FACET_LABEL) as (keyof typeof TAG_FACET_LABEL)[]).filter((k) => d.meta.tag_facets![k]).map((k) => <span className="tag facet" key={k} title={TAG_FACET_LABEL[k]}><i>{TAG_FACET_LABEL[k]}</i>{d.meta.tag_facets![k]}</span>)
          : d.meta.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
        <button className="ghost sm retag" disabled={!!runningJobsFor(jobs, d.meta.id).length || !(d.spec || d.rawSpec)} onClick={() => retag(d.meta.id)} title="让 Claude 按「是什么 / 审美 / UX 方向 / 像什么 / 干嘛用」五个维度重收标签">{d.meta.tag_facets ? '重理标签' : '整理标签'}</button>
      </div>
      <div className="tabs">
        <button className={tab === 'spec' ? 'on' : ''} onClick={() => setTab('spec')}>Spec</button>
        <button className={tab === 'demo' ? 'on' : ''} disabled={!hasSpec} onClick={() => setTab('demo')}>Demo</button>
        <button className={tab === 'handoff' ? 'on' : ''} disabled={!hasSpec} onClick={() => setTab('handoff')} title="给接手的设计师/工程师看的一页">交接</button>
        <button className={tab === 'skill' ? 'on' : ''} disabled={!skillUnlocked} onClick={() => setTab('skill')} title={skillUnlocked ? '' : '确认 demo 后解锁'}>Skill</button>
      </div>
      {tab === 'spec' && <SpecTab d={d} />}
      {tab === 'demo' && <DemoTab d={d} />}
      {tab === 'skill' && <SkillTab d={d} />}
      {tab === 'handoff' && <HandoffTab d={d} />}
      <div className="actions">
        <button onClick={() => api.showInFinder(d.skillMd ? `${d.dir}/skill` : d.dir)}>{I.pencil} Open in Finder</button>
        <button className="primary" disabled={!skillUnlocked} onClick={() => setTab('skill')}>View Skill →</button>
      </div>
    </main>
  );
}
