import { spawn, type ChildProcess } from 'node:child_process';
import { binary, shellEnv } from './paths.js';

export interface ClaudeRunOpts {
  prompt: string;
  cwd: string;
  /** Tools the headless run may use without prompting. */
  allowedTools: string[];
  onLog?: (line: string) => void;
  signal?: AbortSignal;
  model?: string;
  /** extra CLI flags, e.g. ['--chrome'] */
  extraArgs?: string[];
}

const running = new Map<string, ChildProcess>();

/**
 * Run Claude Code headless (`claude -p`) and return the final text result.
 * Uses stream-json so we can forward assistant text to the UI as it happens.
 */
export async function runClaude(opts: ClaudeRunOpts): Promise<string> {
  const claude = binary('claude');
  if (!claude) throw new Error('找不到 claude 命令行。请先安装 Claude Code 并登录。');
  const args = [
    '-p', opts.prompt,
    '--output-format', 'stream-json', '--verbose',
    '--allowedTools', ...opts.allowedTools,
  ];
  if (opts.model) args.push('--model', opts.model);
  if (opts.extraArgs) args.push(...opts.extraArgs);

  return new Promise((resolve, reject) => {
    const p = spawn(claude, args, { cwd: opts.cwd, env: shellEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const key = `${p.pid}`;
    running.set(key, p);
    let result = '';
    let lastText = '';
    let stderr = '';
    let buf = '';
    const onAbort = () => p.kill('SIGTERM');
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    p.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev: any;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'assistant') {
          for (const c of ev.message?.content ?? []) {
            if (c.type === 'text' && c.text) { lastText = c.text; opts.onLog?.(c.text); }
            if (c.type === 'tool_use') opts.onLog?.(`▸ ${c.name} ${summarizeInput(c.input)}`);
          }
        } else if (ev.type === 'result') {
          if (ev.is_error) stderr += `\n${ev.result ?? ''}`;
          result = typeof ev.result === 'string' ? ev.result : lastText;
        }
      }
    });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', (e) => { running.delete(key); reject(e); });
    p.on('close', (code) => {
      running.delete(key);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new Error('已取消'));
      if (code !== 0 && !result) return reject(new Error(`claude 退出码 ${code}: ${stderr.slice(-800)}`));
      resolve(stripNoise(result || lastText));
    });
  });
}

function summarizeInput(input: any): string {
  if (!input) return '';
  const s = input.file_path ?? input.path ?? input.command ?? input.pattern ?? '';
  return typeof s === 'string' ? s.slice(0, 120) : '';
}

/** Pull the first ```json fenced block (or bare JSON object) out of model text. */
export function extractJson<T = any>(text: string): T | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c) as T; } catch { /* next */ }
  }
  return null;
}

/** Drop status-line chatter some user plugins append to every response. */
function stripNoise(s: string): string { return s.replace(/<!--\s*buddy:[\s\S]*?-->/g, '').trim(); }
