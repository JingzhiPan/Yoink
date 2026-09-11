import { useStore } from '../store';
import { I } from './icons';

export function Sidebar({ onSettings }: { onSettings: () => void }) {
  const { goHome, settings } = useStore();
  return (
    <aside className="sidebar drag">
      <img className="logo no-drag" src="./logo.png" alt="" draggable={false} />
      <div className="brand no-drag" onClick={goHome}>YOINK</div>
      <div className="tagline">Turn UI videos into Claude-ready skills.</div>
      <div className="sidebar-foot no-drag">
        <button className="nav-item settings" onClick={onSettings} title="Settings">{I.gear}</button>
        <p>Build for<br />blind models.</p>
        {settings && !settings.ffmpegPath && <p className="warn">缺 ffmpeg</p>}
        {settings && !settings.claudePath && <p className="warn">缺 claude</p>}
      </div>
    </aside>
  );
}
