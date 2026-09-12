import { useEffect, useRef } from 'react';
import type { Job } from '../store';
import { api } from '../api';

const KIND_LABEL: Record<Job['kind'], string> = { extract: '抽帧', parse: '解析', verify: '交叉核对', demo: '生成 demo', screenshot: '截图比对', feedback: '按反馈修改', consolidate: '合并校正 · 精简 spec', tweaks: '抽取 tweaks', skill: '打包 skill', retag: '整理标签', material: '材质拆解 · 待判定' };

export function JobLog({ job }: { job: Job | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [job?.logs.length]);
  if (!job) return null;
  const secs = Math.round((Date.now() - job.startedAt) / 1000);
  return (
    <div>
      <div className="row" style={{ marginBottom: 6, fontSize: 12 }}>
        {job.status === 'running' ? <span className="run"><span className="spin" />{KIND_LABEL[job.kind]}中…</span>
          : job.status === 'error' ? <span style={{ color: 'var(--danger)' }}>✗ {KIND_LABEL[job.kind]}失败</span>
          : <span style={{ color: 'var(--ok)' }}>✓ {KIND_LABEL[job.kind]}完成</span>}
        {job.status === 'running' && secs > 5 && <span className="hint">{secs}s</span>}
        <span className="spacer" />
        {job.status === 'running' && <button className="ghost sm" onClick={() => api.cancelJob(job.jobId)}>取消</button>}
      </div>
      <div className="log" ref={ref}>
        {job.logs.length ? job.logs.map((l, i) => <div key={i} className={l.startsWith('✗') ? 'err' : ''}>{l}</div>) : <span className="hint">等待输出…</span>}
      </div>
    </div>
  );
}
