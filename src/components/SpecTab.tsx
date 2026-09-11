import { useEffect, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Gallery, MetaEditor } from './common';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';

export function SpecTab({ d }: { d: PatternDetail }) {
  const { storeRaw, verify, saveSpec, updateMeta } = useStore();
  const jobs = useStore((s) => s.jobs);
  const settings = useStore((s) => s.settings);
  const running = runningJobsFor(jobs, d.meta.id).length > 0;
  const job = latestJobFor(jobs, d.meta.id);
  const [raw, setRaw] = useState('');
  const [spec, setSpec] = useState(d.spec ?? '');
  const [editing, setEditing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => { setSpec(d.spec ?? ''); }, [d.spec]);
  const dirty = spec !== (d.spec ?? '');
  const id = d.meta.id;

  return (
    <>
        {!d.rawSpec && (
          <>
            <h3>① 粘贴 spec</h3>
            <div className="callout">
              把视频丢给 ChatGPT（或任何能看视频的工具），让它写一份交互 spec，然后把文字粘到下面。格式随意，俺会自动整理。
              {settings?.inputMethod !== 'manual' && <div className="hint" style={{ marginTop: 6 }}>这条还没自动解析。可以直接粘贴，或者点右边重跑。</div>}
            </div>
            <textarea className="mono" style={{ minHeight: 220 }} placeholder="# Liquid Gooey Effect&#10;&#10;When the user hovers…" value={raw} onChange={(e) => setRaw(e.target.value)} />
            <div className="row">
              <button className="primary" disabled={!raw.trim() || running} onClick={async () => { await storeRaw(id, raw); setRaw(''); }}>存为原始 spec</button>
              {(settings?.inputMethod === 'api' || settings?.inputMethod === 'computer_use') && <ApiParseButton id={id} method={settings.inputMethod} disabled={running} />}
            </div>
          </>
        )}
        {d.rawSpec && !d.spec && (
          <>
            <h3>② 交叉核对</h3>
            <div className="callout">原始 spec 已存。下一步让 Claude 拿 {d.frames.length} 张关键帧逐条核对：删掉脑补的，补上漏掉的，修正技术方案。</div>
            <div className="row"><button className="primary" disabled={running} onClick={() => verify(id)}>开始核对</button><button className="ghost" onClick={() => setShowRaw(!showRaw)}>{showRaw ? '收起' : '查看'}原始 spec</button></div>
            {showRaw && <Markdown text={d.rawSpec} />}
          </>
        )}
        {d.spec && (
          <>
            <div className="row">
              <h3>Verified spec</h3><span className="spacer" />
              {editing ? (<>
                <button className="sm" onClick={() => { setSpec(d.spec ?? ''); setEditing(false); }}>取消</button>
                <button className="primary sm" disabled={!dirty} onClick={async () => { await saveSpec(id, spec); setEditing(false); }}>保存</button>
              </>) : (<>
                <button className="sm" onClick={() => setShowRaw(!showRaw)}>{showRaw ? '看 verified' : '看原始'}</button>
                <button className="sm" disabled={running} onClick={() => verify(id)} title="用当前原始 spec 重新核对">重新核对</button>
                <button className="sm" onClick={() => setEditing(true)}>编辑</button>
              </>)}
            </div>
            {editing ? <textarea className="mono" style={{ minHeight: 320 }} value={spec} onChange={(e) => setSpec(e.target.value)} />
              : <Markdown text={showRaw ? (d.rawSpec ?? '') : d.spec} />}
          </>
        )}
        <JobLog job={job} />
        <h3>Key Frames · {d.frames.length}</h3>
        <Gallery files={d.frames} />
        <h3>Metadata</h3>
        <MetaEditor key={d.meta.id + d.meta.status} meta={d.meta} onChange={(p) => updateMeta(id, p)} />
        {d.videoPath && <video src={window.yoink.fileUrl(d.videoPath)} controls muted style={{ width: '100%', borderRadius: 8 }} />}
    </>
  );
}

function ApiParseButton({ id, method, disabled }: { id: string; method: 'api' | 'computer_use'; disabled: boolean }) {
  const run = async () => {
    const st = useStore.getState();
    const jobId = Math.random().toString(36).slice(2, 10);
    useStore.setState((s) => ({ jobs: { ...s.jobs, [jobId]: { jobId, patternId: id, kind: 'parse', logs: [], status: 'running', startedAt: Date.now() } } }));
    try { await window.yoink.parseAuto(jobId, id, method); } catch { /* shown in log */ }
    await st.refreshList(); await st.reloadCurrent();
  };
  return <button disabled={disabled} onClick={run}>{method === 'api' ? '用 OpenAI 自动解析' : '让 Claude 去 ChatGPT 解析'}</button>;
}
