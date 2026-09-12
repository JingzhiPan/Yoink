import type { PatternDetail } from '../../shared/types';
import { Markdown } from './Markdown';
import { api } from '../api';

/** One page for whoever takes the demo over: built from spec sections, judgment answers and the tweaks manifest. */
export function HandoffTab({ d }: { d: PatternDetail }) {
  if (!d.handoff) return <div className="hint">还没有 spec，交接页要等核对完。</div>;
  return (
    <>
      <div className="row"><h3>交接</h3><span className="hint">自动从 spec、判定清单和 tweaks 清单拼出来，改那三处它就跟着变。文件在 handoff.md，skill 里也带一份。</span><span className="spacer" /><button className="sm" onClick={() => api.showInFinder(`${d.dir}/handoff.md`)}>在 Finder 显示</button></div>
      {d.consolidateDiff && (<><h3>精简时的 diff</h3><div className="callout"><Markdown text={d.consolidateDiff} /></div></>)}
      <Markdown text={d.handoff} />
    </>
  );
}
