import { useState } from 'react';
import type { PatternMeta, PatternStatus } from '../../shared/types';
import { CATEGORIES, COMPLEXITIES } from '../../shared/types';
import { api } from '../api';

export const STATUS_LABEL: Record<PatternStatus, string> = {
  frames_extracted: '已抽帧', raw_spec: '待核对', verified: '已核对', demo_wip: 'demo 调整中', demo_done: 'demo 完成', skill_ready: 'skill 就绪',
};
export const STATUS_COLOR: Record<PatternStatus, string> = {
  frames_extracted: 'var(--s-frames)', raw_spec: 'var(--s-raw)', verified: 'var(--s-verified)', demo_wip: 'var(--s-wip)', demo_done: 'var(--s-done)', skill_ready: 'var(--s-skill)',
};

export function StatusBadge({ status, className = 'status' }: { status: PatternStatus; className?: string }) {
  return <span className={className} style={{ ['--sc' as string]: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>;
}

export function Gallery({ files, caption }: { files: string[]; caption?: (f: string, i: number) => string }) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (!files.length) return <div className="hint">（空）</div>;
  return (
    <>
      <div className="strip">
        {files.map((f, i) => (
          <figure key={f} onClick={() => setZoom(f)} title={caption ? caption(f, i) : f.split('/').pop()}>
            <img src={api.fileUrl(f)} alt="" loading="lazy" />
          </figure>
        ))}
      </div>
      {zoom && <div className="lightbox" onClick={() => setZoom(null)}><img src={api.fileUrl(zoom)} alt="" /></div>}
    </>
  );
}

export function MetaEditor({ meta, onChange }: { meta: PatternMeta; onChange: (p: Partial<PatternMeta>) => void }) {
  const [tags, setTags] = useState(meta.tags.join(', '));
  const [tech, setTech] = useState(meta.tech_hints.join(', '));
  const split = (s: string) => s.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  return (
    <div className="metaform">
      <label>标签</label>
      <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => onChange({ tags: split(tags) })} placeholder="animation, gooey, spring" />
      <label>分类</label>
      <select value={meta.category} onChange={(e) => onChange({ category: e.target.value as PatternMeta['category'] })}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label>复杂度</label>
      <select value={meta.complexity} onChange={(e) => onChange({ complexity: e.target.value as PatternMeta['complexity'] })}>
        {COMPLEXITIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label>技术提示</label>
      <input value={tech} onChange={(e) => setTech(e.target.value)} onBlur={() => onChange({ tech_hints: split(tech) })} placeholder="SVG filter, Framer Motion" />
      <label>来源</label>
      <input defaultValue={meta.source_url} onBlur={(e) => onChange({ source_url: e.target.value })} placeholder="https://…" />
      <label>备注</label>
      <input defaultValue={meta.notes} onBlur={(e) => onChange({ notes: e.target.value })} />
    </div>
  );
}
