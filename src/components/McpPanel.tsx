import { useEffect, useState } from 'react';
import { api } from '../api';

export function McpPanel({ onClose, onPickMethod }: { onClose: () => void; onPickMethod: () => void }) {
  const [info, setInfo] = useState<{ serverPath: string; libraryRoot: string } | null>(null);
  useEffect(() => { api.mcpInfo().then(setInfo); }, []);
  const cmd = info ? `claude mcp add --scope user yoink -- node "${info.serverPath}"` : '';
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="sub">没有设置页。只有两件事：视频怎么解析，以及怎么接到 Claude Code。</p>
        <div className="row" style={{ marginBottom: 16 }}><button onClick={onPickMethod}>更改解析方式 / OpenAI key</button></div>
        <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--display)' }}>接到 Claude Code</h3>
        <p className="hint" style={{ margin: '0 0 8px' }}>在终端跑一次下面这条，以后 Claude Code 写新需求时就能自己检索、调用这个库里的 skill。</p>
        <div className="kv">{cmd || '…'}</div>
        <div className="hint" style={{ marginTop: 10 }}>暴露的 tool：search_patterns · get_spec · get_frames · get_demo_screenshots · get_skill<br />素材库目录：{info?.libraryRoot}</div>
        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={() => navigator.clipboard.writeText(cmd)}>复制命令</button>
          <button className="primary" onClick={onClose}>好</button>
        </div>
      </div>
    </div>
  );
}
