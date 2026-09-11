import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/Library';
import { DetailPanel } from './components/DetailPanel';
import { MethodPicker } from './components/MethodPicker';
import { McpPanel } from './components/McpPanel';

export default function App() {
  const { init, showMethodPicker } = useStore();
  const [picker, setPicker] = useState(false);
  const [mcp, setMcp] = useState(false);
  useEffect(() => { init(); }, [init]);
  return (
    <div className="app">
      <Sidebar onSettings={() => setMcp(true)} />
      <Library onPickMethod={() => setPicker(true)} />
      <DetailPanel />
      {(showMethodPicker || picker) && <MethodPicker onClose={picker ? () => setPicker(false) : undefined} />}
      {mcp && <McpPanel onClose={() => setMcp(false)} onPickMethod={() => { setMcp(false); setPicker(true); }} />}
    </div>
  );
}
