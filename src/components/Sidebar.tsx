import { useMemo } from 'react';
import { useStore } from '../store';
import { I } from './icons';
import { api } from '../api';
import { STATUS_LABEL } from './common';
import { STATUS_ORDER, CATEGORIES, type PatternStatus, type Category } from '../../shared/types';

export function Sidebar({ onSettings }: { onSettings: () => void }) {
  const { goHome, settings, patterns, filters, setFilters, open, current } = useStore();
  const allTags = useMemo(() => { const c = new Map<string, number>(); patterns.forEach((p) => p.tags.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); }, [patterns]);
  const favs = patterns.filter((p) => p.favorite);
  const lib = settings?.libraryRoot ?? '';
  return (
    <aside className="sidebar drag">
      <img className="logo no-drag" src="./logo.png" alt="" draggable={false} />
      <div className="brand no-drag" onClick={goHome}>YOINK</div>
      <div className="tagline">Turn UI videos into Claude-ready skills.</div>

      <div className="side-filters no-drag">
        <select value={filters.status} onChange={(e) => setFilters({ status: e.target.value as PatternStatus | '' })}><option value="">All Status</option>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <select value={filters.cat} onChange={(e) => setFilters({ cat: e.target.value as Category | '' })}><option value="">All Categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.tag} onChange={(e) => setFilters({ tag: e.target.value })}><option value="">All Tags</option>{allTags.map((t) => <option key={t} value={t}>#{t}</option>)}</select>
      </div>

      <div className="favs no-drag">
        <h4><span className="heart">{I.heart}</span> Favorites · {favs.length}</h4>
        {favs.length === 0 && <div className="hint">卡片右上角 "…" 里点喜欢，就会出现在这。</div>}
        {favs.map((p) => (
          <button key={p.id} className={`fav ${current?.meta.id === p.id ? 'on' : ''}`} onClick={() => open(p.id)}>
            <img src={api.fileUrl(`${lib}/${p.id}/cover.png`) + '?v=' + p.demo_screenshot_count} alt="" onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = api.fileUrl(`${lib}/${p.id}/frames/frame-001.png`); } }} />
            <span>{p.name}</span>
          </button>
        ))}
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
