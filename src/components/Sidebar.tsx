import { useStore } from '../store';
import { I } from './icons';
import { api } from '../api';

export function Sidebar({ onSettings }: { onSettings: () => void }) {
  const goHome = useStore((s) => s.goHome);
  const importVideos = useStore((s) => s.importVideos);
  const settings = useStore((s) => s.settings);
  const current = useStore((s) => s.current);
  return (
    <aside className="sidebar drag">
      <img className="logo no-drag" src="./logo.png" alt="" draggable={false} />
      <div className="brand no-drag" onClick={goHome}>YOINK</div>
      <div className="tagline">Turn UI videos into Claude-ready skills.</div>
      <nav className="nav">
        <button className={`nav-item ${!current ? 'active' : ''}`} onClick={goHome}>{I.grid} Library</button>
        <button className="nav-item" onClick={async () => { const p = await api.selectVideos(); if (p.length) importVideos(p); }}>{I.plus} New Import</button>
        <button className="nav-item" onClick={onSettings}>{I.gear} Settings</button>
      </nav>
      <div className="sidebar-foot">
        <div className="rule" />
        <p>Build for<br />blind models.</p>
        {settings && !settings.ffmpegPath && <p className="warn">缺 ffmpeg：brew install ffmpeg</p>}
        {settings && !settings.claudePath && <p className="warn">缺 claude 命令行</p>}
      </div>
    </aside>
  );
}
