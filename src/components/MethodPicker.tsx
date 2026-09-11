import { useState } from 'react';
import type { InputMethod } from '../../shared/types';
import { useStore } from '../store';

export function MethodPicker({ onClose }: { onClose?: () => void }) {
  const settings = useStore((s) => s.settings);
  const setInputMethod = useStore((s) => s.setInputMethod);
  const [method, setMethod] = useState<InputMethod>(settings?.inputMethod ?? 'manual');
  const [key, setKey] = useState('');
  const needKey = method === 'api' && !settings?.hasOpenAIKey && !key;
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>视频怎么解析成 spec？</h2>
        <p className="sub">选一次就记住。之后随时可以在首页改。</p>
        <div className="methods">
          <button className={`method-card ${method === 'api' ? 'on' : ''}`} onClick={() => setMethod('api')}>
            <b>① API 模式</b><small>填一次 OpenAI API key，之后拖视频全自动。最稳最快，几块钱一个月。</small>
          </button>
          <button className="method-card off" disabled title="还没做好">
            <b>② Computer Use</b><small>用你登录好的 ChatGPT 网页自动处理。（开发中）</small>
          </button>
          <button className={`method-card ${method === 'manual' ? 'on' : ''}`} onClick={() => setMethod('manual')}>
            <b>③ 手动模式</b><small>你自己去 ChatGPT 处理视频，把 spec 文字粘进来。什么都不依赖。</small>
          </button>
        </div>
        {method === 'api' && (
          <div style={{ marginTop: 14 }}>
            <input style={{ width: '100%' }} type="password" placeholder={settings?.hasOpenAIKey ? '已保存 key，留空则不改' : 'sk-…'} value={key} onChange={(e) => setKey(e.target.value)} />
            <div className="hint" style={{ marginTop: 6 }}>key 用系统钥匙串加密存本地，不会发给 OpenAI 以外的任何地方。</div>
          </div>
        )}
        <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          {onClose && <button className="ghost" onClick={onClose}>取消</button>}
          <button className="primary" disabled={needKey} onClick={async () => { await setInputMethod(method, key || undefined); onClose?.(); }}>就这个</button>
        </div>
      </div>
    </div>
  );
}
