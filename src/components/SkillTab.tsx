import { useEffect, useState } from 'react';
import type { PatternDetail } from '../../shared/types';
import { useStore, runningJobsFor, latestJobFor } from '../store';
import { Markdown } from './Markdown';
import { JobLog } from './JobLog';
import { Gallery } from './common';
import { api } from '../api';

export function SkillTab({ d }: { d: PatternDetail }) {
  const { generateSkill, packSkill, saveSkillMd, adapt } = useStore();
  const [aName, setAName] = useState('');
  const [aStack, setAStack] = useState('html');
  const [aTokens, setATokens] = useState('');
  const [aNotes, setANotes] = useState('');
  const [aOpen, setAOpen] = useState<string | null>(null);
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
        <h3>移植 · {d.adaptations.length}</h3>
        <div className="callout">换品牌 token 或技术栈，不重设计：只碰零件清单里「可替换」的，「不可动」原样搬。要求换但会露馅的会写进 ADAPT.md 拒绝并给折中。{!d.traits && <b> 先去交接页拆零件。</b>}</div>
        <div className="adapt-form">
          <div className="row">
            <input placeholder="名字，如 Acme 品牌版" value={aName} onChange={(e) => setAName(e.target.value)} style={{ flex: 1 }} />
            <select value={aStack} onChange={(e) => setAStack(e.target.value)}><option value="html">HTML/CSS/JS</option><option value="react">React (TSX)</option><option value="vue">Vue 3 SFC</option></select>
          </div>
          <textarea placeholder={'设计 tokens，随便写：\n主色 #6D5DF6，圆角 12px，字体 Inter，背景 #0B0B10，时长整体快 20%'} value={aTokens} onChange={(e) => setATokens(e.target.value)} style={{ minHeight: 70 }} />
          <div className="row">
            <input placeholder="其他要求（可空）：比如去掉底部辉光、只要一张卡" value={aNotes} onChange={(e) => setANotes(e.target.value)} style={{ flex: 1 }} />
            <button className="primary sm" disabled={running || !d.traits || !aName.trim()} onClick={() => { adapt(id, { name: aName.trim(), stack: aStack, tokens: aTokens, notes: aNotes }); setAName(''); }}>移植</button>
          </div>
        </div>
        {d.adaptations.map((a) => (
          <div key={a.slug} className="variant" style={{ flexWrap: 'wrap' }}>
            <span className="vname">{a.name}</span><span className="hint">{a.stack} · {a.created.slice(0, 16).replace('T', ' ')}</span><span className="spacer" />
            {a.index && <button className="ghost sm" onClick={() => setAOpen(aOpen === a.slug ? null : a.slug)}>{aOpen === a.slug ? '收起预览' : '预览'}</button>}
            <button className="ghost sm" onClick={() => api.showInFinder(`${d.dir}/adaptations/${a.slug}`)}>Finder</button>
            {aOpen === a.slug && a.index && <div className="iframewrap browse-frame" style={{ width: '100%' }}><iframe src={api.fileUrl(a.index)} sandbox="allow-scripts allow-same-origin" title={a.name} /></div>}
            {aOpen === a.slug && a.note && <div style={{ width: '100%' }}><Markdown text={a.note} /></div>}
          </div>
        ))}
        <h3>demo 截图 · {d.demoScreenshots.length}</h3>
        <Gallery files={d.demoScreenshots} />
    </>
  );
}
