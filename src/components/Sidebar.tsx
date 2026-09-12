import { useMemo } from 'react';
import { useStore } from '../store';
import { I } from './icons';
import { api } from '../api';
import { STATUS_COLOR } from './common';
import { CATEGORIES, type Category } from '../../shared/types';

export function Sidebar({ onSettings }: { onSettings: () => void }) {
  const { goHome, settings, patterns, filters, setFilters, open, current, previewVariant, setPreviewVariant } = useStore();
  const jobs = useStore((s) => s.jobs);
  const busy = (id: string, variant: string | null) => Object.values(jobs).some((j) => j.patternId === id && j.status === 'running' && (j.variant ?? null) === variant);
  const fish = <span className="fish" title="Claude 正在这里干活">{I.fish}</span>;
  const allTags = useMemo(() => { const c = new Map<string, number>(); patterns.forEach((p) => p.tags.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); }, [patterns]);
  const lib = settings?.libraryRoot ?? '';
  const working = !!current;
  const thumb = (p: { id: string; demo_screenshot_count: number; favorite?: boolean }) => (
    <span className="thumb">
      <img src={api.fileUrl(`${lib}/${p.id}/cover.png`) + '?v=' + p.demo_screenshot_count} alt="" onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = api.fileUrl(`${lib}/${p.id}/frames/frame-001.png`); } }} />
    </span>
  );
  const list = working
    ? [...patterns].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)).filter((p) => (!filters.cat || p.category === filters.cat) && (!filters.tag || p.tags.includes(filters.tag)))
    : patterns.filter((p) => p.favorite);

  return (
    <aside className="sidebar drag">
      {!working && <>
        <img className="logo no-drag" src="./logo.png" alt="" draggable={false} onClick={goHome} />
        <div className="brand no-drag" onClick={goHome}>YOINK</div>
        <div className="tagline">Turn UI videos into Claude-ready skills.</div>
      </>}

      {!working && <div className="side-filters no-drag">
        <select value={filters.cat} onChange={(e) => setFilters({ cat: e.target.value as Category | '' })}><option value="">All Categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.tag} onChange={(e) => setFilters({ tag: e.target.value })}><option value="">All Tags</option>{allTags.map((t) => <option key={t} value={t}>#{t}</option>)}</select>
      </div>}

      <div className={`favs no-drag ${working ? 'top' : ''}`}>
        <h4>{working ? <button className="ghost sm back" onClick={goHome} title="回到 Library">← Library · {list.length}</button> : <><span className="heart">{I.heart}</span> Favorites · {list.length}</>}</h4>
        {!working && list.length === 0 && <div className="hint">卡片右上角 "…" 里点喜欢，就会出现在这。</div>}
        {list.map((p) => {
          const isCur = current?.meta.id === p.id;
          const variants = isCur ? current!.variants : [];
          return (
            <div key={p.id} className="fav-group">
              <button className={`fav ${isCur && !previewVariant ? 'on' : ''}`} onClick={() => { if (isCur) setPreviewVariant(null); else open(p.id); }}>
                {p.favorite && <span className="heart mini">{I.heart}</span>}
                {thumb(p)}
                <span className="name">{p.name}</span>
                {busy(p.id, null) ? fish : working && <i className="dot" style={{ background: STATUS_COLOR[p.status] }} title={p.status} />}
              </button>
              {variants.map((v) => (
                <button key={v.slug} className={`fav sub ${previewVariant === v.index ? 'on' : ''}`} onClick={() => setPreviewVariant(previewVariant === v.index ? null : v.index)} title={v.created.slice(0, 16).replace('T', ' ')}>
                  <i className="branch" /><span className="name">{v.name}</span>{busy(p.id, v.slug) && fish}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="sidebar-foot no-drag">
        <button className="nav-item settings" onClick={onSettings} title="Settings">{I.gear}</button>
        <p>Build for<br />blind models.</p>
        {settings && !settings.ffmpegPath && <p className="warn">缺 ffmpeg</p>}
        {settings && !settings.claudePath && <p className="warn">缺 claude</p>}
      </div>
    </aside>
  );
}
