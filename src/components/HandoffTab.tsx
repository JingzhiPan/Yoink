import type { PatternDetail } from '../../shared/types';
import { Markdown } from './Markdown';
import { api } from '../api';
import { useStore, runningJobsFor } from '../store';
import { useEffect, useState } from 'react';

/** One page for whoever takes the demo over: built from spec sections, judgment answers and the tweaks manifest. */
export function HandoffTab({ d }: { d: PatternDetail }) {
  const { traits, distill } = useStore();
  const jobs = useStore((s) => s.jobs);
  const running = runningJobsFor(jobs, d.meta.id).length > 0;
  const [leaves, setLeaves] = useState<{ kind: string; slug: string; builtin: boolean; match: string[] }[]>([]);
  useEffect(() => { api.listLeaves().then(setLeaves).catch(() => {}); }, [d.meta.id, jobs]);
  if (!d.handoff) return <div className="hint">还没有 spec，交接页要等核对完。</div>;
  return (
    <>
      <div className="row"><h3>交接</h3><span className="hint">自动从 spec、判定清单和 tweaks 清单拼出来，改那三处它就跟着变。文件在 handoff.md，skill 里也带一份。</span><span className="spacer" /><button className="sm" onClick={() => api.showInFinder(`${d.dir}/handoff.md`)}>在 Finder 显示</button></div>
      <div className="row">
        <h3>零件与叶子</h3><span className="hint">确认 demo 时自动做；这里可以重跑。</span><span className="spacer" />
        <button className="sm" disabled={running || !d.demoIndex} onClick={() => traits(d.meta.id)}>{d.traits ? '重拆零件' : '拆零件'}</button>
        <button className="sm" disabled={running || !d.traits} onClick={() => distill(d.meta.id)} title="把这条学到的沉淀成 materials / geometry / motion 叶子，以后同类问题自动加载">沉淀 skill 叶子</button>
      </div>
      {leaves.length > 0 && <div className="hint">库里现有叶子：{leaves.map((l) => `${l.kind}/${l.slug}${l.builtin ? '（内置）' : ''}`).join(' · ')}</div>}
      {d.consolidateDiff && (<><h3>精简时的 diff</h3><div className="callout"><Markdown text={d.consolidateDiff} /></div></>)}
      <Markdown text={d.handoff} />
    </>
  );
}
