import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { StatusBadge, STATUS_LABEL } from './common';
import { STATUS_ORDER, CATEGORIES, type PatternStatus, type Category } from '../../shared/types';
import { I } from './icons';

const METHOD_NAME = { api: 'API 模式', computer_use: 'Computer Use', manual: '手动模式' };
const KIND_STEP: Record<string, number> = { extract: 0, parse: 1, verify: 2 };

export function Library({ onPickMethod }: { onPickMethod: () => void }) {
  const { patterns, open, current, importVideos, settings, jobs, updateMeta, deletePattern, filters, setFilters } = useStore();
  const { status, cat, tag } = filters;
  const allTags = useMemo(() => { const c = new Map<string, number>(); patterns.forEach((p) => p.tags.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); }, [patterns]);
  const [menu, setMenu] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false);
  const shown = [...patterns].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)).filter((p) => {
    if (status && p.status !== status) return false;
    if (cat && p.category !== cat) return false;
    if (tag && !p.tags.includes(tag)) return false;
    if (q) { const s = q.toLowerCase(); return [p.name, p.id, p.notes, ...p.tags, ...p.tech_hints, p.category].some((x) => x.toLowerCase().includes(s)); }
    return true;
  });
  const activeImports = Object.values(jobs).filter((j) => ['extract', 'parse', 'verify'].includes(j.kind) && (j.status === 'running' || Date.now() - j.startedAt < 60_000)).sort((a, b) => b.startedAt - a.startedAt).slice(0, 4);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const paths = Array.from(e.dataTransfer.files).filter((f) => /\.(mp4|mov|webm|m4v|gif|mkv)$/i.test(f.name)).map((f) => api.getPathForFile(f));
    if (paths.length) importVideos(paths);
  };
  const lib = settings?.libraryRoot ?? '';

  return (
    <section className="center">
      <div className="top drag">
        <label className="search no-drag">{I.search}<input placeholder="Search patterns, tags, or describe an interaction..." value={q} onChange={(e) => setQ(e.target.value)} /><span className="kbd">⌘ K</span></label>
      </div>
      <div className={`dropzone ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        onClick={async () => { const p = await api.selectVideos(); if (p.length) importVideos(p); }}>
        {I.film}
        <h2>Drag a video here</h2>
        <p>We'll extract frames, analyze interactions, generate a demo,<br />and package it as a Claude-ready skill — automatically.</p>
        <p className="method" onClick={(e) => { e.stopPropagation(); onPickMethod(); }}>解析方式：<b>{settings?.inputMethod ? METHOD_NAME[settings.inputMethod] : '未选择'}</b> · 点此更改</p>
        <div className="scribble"><span>Just drop it.</span>{I.arrow}</div>
      </div>
      <div className="filters">
        <select value={status} onChange={(e) => setFilters({ status: e.target.value as PatternStatus | '' })}><option value="">All Status</option>{STATUS_ORDER.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}</select>
        <select value={cat} onChange={(e) => setFilters({ cat: e.target.value as Category | '' })}><option value="">All Categories</option>{CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select value={tag} onChange={(e) => setFilters({ tag: e.target.value })}><option value="">All Tags</option>{allTags.map((x) => <option key={x} value={x}>#{x}</option>)}</select>
        <span className="count">{shown.length} / {patterns.length}</span>
      </div>
      {activeImports.length > 0 && (
        <div className="jobs">
          {activeImports.map((j) => (
            <div className="jobrow" key={j.jobId} onClick={() => j.patternId !== '(new)' && open(j.patternId)}>
              <div className="pipe">{[0, 1, 2].map((i) => <i key={i} className={i < KIND_STEP[j.kind] ? 'done' : i === KIND_STEP[j.kind] ? (j.status === 'error' ? 'err' : j.status === 'done' ? 'done' : 'on') : ''} />)}</div>
              <span className="id">{j.patternId}</span>
              <span className="msg">{j.status === 'running' && <span className="spin" />}{j.logs[j.logs.length - 1] ?? '…'}</span>
            </div>
          ))}
        </div>
      )}
      <div className="gridwrap">
        {shown.length === 0 ? <div className="emptylib">{patterns.length ? 'No pattern matches.' : 'Nothing here yet. Drop a video.'}</div> : (
          <div className="grid">
            {shown.map((p) => (
              <div className={`card ${current?.meta.id === p.id ? 'selected' : ''}`} key={p.id} onClick={() => open(p.id)}>
                <div className="cover">{p.frame_count > 0 ? <img src={api.fileUrl(`${lib}/${p.id}/cover.png`) + '?v=' + p.demo_screenshot_count} alt="" loading="lazy" onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = api.fileUrl(`${lib}/${p.id}/frames/frame-001.png`); } }} /> : 'no cover'}</div>
                {p.favorite && <span className="heart" title="喜欢">{I.heart}</span>}
                <button className="dots" onClick={(e) => { e.stopPropagation(); setMenu(menu === p.id ? null : p.id); }}>{I.dots}</button>
                {menu === p.id && (
                  <div className="menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { updateMeta(p.id, { favorite: !p.favorite }); setMenu(null); }}>{p.favorite ? '取消喜欢' : '喜欢'}</button>
                    <button className="danger" onClick={() => { setMenu(null); if (confirm(`删除 ${p.name}？整个文件夹都会删掉。`)) deletePattern(p.id); }}>删除</button>
                  </div>
                )}
                <div className="body">
                  <div className="name" title={p.name}>{p.name}</div>
                  <div className="tags">{p.tags.slice(0, 3).map((t) => <span className="tag" key={t}>{t}</span>)}{p.tags.length === 0 && <span className="tag">{p.category}</span>}</div>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
