import { useEffect, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Gallery, MetaEditor } from './common';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';
import { Judgment } from './Judgment';
import { RegionPicker } from './RegionPicker';

export function SpecTab({ d }: { d: PatternDetail }) {
  const { storeRaw, verify, saveSpec, updateMeta, material, saveJudgment } = useStore();
  const jobs = useStore((s) => s.jobs);
  const settings = useStore((s) => s.settings);
  const running = runningJobsFor(jobs, d.meta.id).length > 0;
  const job = latestJobFor(jobs, d.meta.id);
  const [raw, setRaw] = useState('');
  const [spec, setSpec] = useState(d.spec ?? '');
  const [editing, setEditing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [matPick, setMatPick] = useState(false);
  const [menu, setMenu] = useState(false);
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
              <h3>{showRaw ? (d.specVerified ? '核对长版' : '原始 spec') : d.specVerified ? 'Final spec' : 'Verified spec'}</h3>
              <span className="hint">{d.specVerified ? '确认 demo 时精简过' : '已逐帧核对'}{d.judgment ? ` · 已拆材质，${d.judgment.filter((j) => !j.answer.trim()).length ? `待判定 ${d.judgment.filter((j) => !j.answer.trim()).length}` : '判定完'}` : ''}</span>
              <span className="spacer" />
              {editing ? (<>
                <button className="sm" onClick={() => { setSpec(d.spec ?? ''); setEditing(false); }}>取消</button>
                <button className="primary sm" disabled={!dirty} onClick={async () => { await saveSpec(id, spec); setEditing(false); }}>保存</button>
              </>) : showRaw ? <button className="sm" onClick={() => setShowRaw(false)}>回到当前</button> : (<>
                <button className="sm" onClick={() => setEditing(true)}>编辑</button>
                <span className="menu-wrap">
                  <button className="sm" onClick={() => setMenu(!menu)} title="不常用的">⋯</button>
                  {menu && <div className="menu" onMouseLeave={() => setMenu(false)}>
                    <button onClick={() => { setMenu(false); setShowRaw(true); }}>{d.specVerified ? '看核对长版' : '看原始 spec'}</button>
                    <button disabled={running} onClick={() => { setMenu(false); verify(id); }}>重新核对（会接着拆材质）</button>
                    <button disabled={running} onClick={() => { setMenu(false); setMatPick(true); }}>{d.judgment ? '重做材质拆解（框主体）' : '材质拆解（框主体）'}</button>
                  </div>}
                </span>
              </>)}
            </div>
            {editing ? <textarea className="mono" style={{ minHeight: 320 }} value={spec} onChange={(e) => setSpec(e.target.value)} />
              : <Markdown text={showRaw ? (d.specVerified ?? d.rawSpec ?? '') : d.spec} />}
          </>
        )}
        {d.spec && !d.judgment && !running && <div className="callout">核对完了还没拆材质。<button className="sm" style={{ marginLeft: 8 }} onClick={() => setMatPick(true)}>框主体，拆材质</button></div>}
        {matPick && <RegionPicker frames={d.frames} onClose={() => setMatPick(false)} onPick={() => {}} multi={{ title: '框出要拆材质的主体', sub: '选一帧，框住那个元素（比如一张卡）。最多三块；录屏里有代码编辑器之类的东西就别框进去。', onDone: (picks) => { setMatPick(false); material(id, picks); } }} />}
        {d.judgment && <Judgment items={d.judgment} frames={d.frames} onSave={(items) => saveJudgment(id, items)} />}
        {d.materialCrops.length > 0 && (<><h3>材质放大图 · {d.materialCrops.length}</h3><Gallery files={d.materialCrops} /></>)}
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
