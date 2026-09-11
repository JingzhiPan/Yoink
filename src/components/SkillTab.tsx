import { useEffect, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';
import { Gallery } from './common';
import { api } from '../api';

export function SkillTab({ d }: { d: PatternDetail }) {
  const { generateSkill, packSkill, saveSkillMd } = useStore();
  const jobs = useStore((s) => s.jobs);
  const running = runningJobsFor(jobs, d.meta.id).length > 0;
  const job = latestJobFor(jobs, d.meta.id);
  const [md, setMd] = useState(d.skillMd ?? '');
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ file: string; text: string } | null>(null);
  useEffect(() => { setMd(d.skillMd ?? ''); }, [d.skillMd]);
  const id = d.meta.id;
  const codeFiles = d.skillFiles.filter((f) => f.startsWith('component/'));
  const ready = d.meta.status === 'skill_ready';

  return (
    <>
        {!d.skillMd ? (
          <>
            <h3>生成 skill</h3>
            <div className="callout">Claude Code 会把确认过的 demo 抽成可复用组件，写 SKILL.md（触发条件 + 用法），连同 spec 和 demo 截图一起打包。</div>
            <div className="row"><button className="primary" disabled={running} onClick={() => generateSkill(id)}>生成 skill</button></div>
          </>
        ) : (
          <>
            <div className="row">
              <h3>SKILL.md</h3><span className="spacer" />
              {editing ? (<>
                <button className="sm" onClick={() => { setMd(d.skillMd ?? ''); setEditing(false); }}>取消</button>
                <button className="primary sm" onClick={async () => { await saveSkillMd(id, md); setEditing(false); }}>保存</button>
              </>) : (<>
                <button className="sm" onClick={() => setEditing(true)}>编辑</button>
                <button className="sm" disabled={running} onClick={() => generateSkill(id)}>重新生成</button>
                {!ready && <button className="primary sm" disabled={running} onClick={() => packSkill(id)}>打包 skill ✓</button>}
                {ready && <span className="status" style={{ ['--sc' as string]: 'var(--s-skill)' }}>skill 就绪 · 已可被 Claude Code 检索</span>}
              </>)}
            </div>
            {editing ? <textarea className="mono" style={{ minHeight: 320 }} value={md} onChange={(e) => setMd(e.target.value)} /> : <Markdown text={d.skillMd} />}
          </>
        )}
        <JobLog job={job} />
        <h3>组件代码</h3>
        {codeFiles.length === 0 ? <div className="hint">（尚无）</div> : (
          <div className="filelist">{codeFiles.map((f) => <a key={f} href="#" onClick={async (e) => { e.preventDefault(); setPreview({ file: f, text: await api.readFile(`${d.dir}/skill/${f}`) }); }}>{f}</a>)}</div>
        )}
        {preview && (<><div className="row"><span className="hint">{preview.file}</span><span className="spacer" /><button className="ghost sm" onClick={() => setPreview(null)}>关闭</button></div><pre className="log" style={{ maxHeight: 360 }}>{preview.text}</pre></>)}
        <h3>demo 截图 · {d.demoScreenshots.length}</h3>
        <Gallery files={d.demoScreenshots} />
    </>
  );
}
