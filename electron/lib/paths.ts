import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

export const LIBRARY_ROOT = process.env.YOINK_LIBRARY ?? path.join(homedir(), 'yoink');

const CANDIDATE_DIRS = [
  path.join(homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  path.join(homedir(), '.bun', 'bin'),
  path.join(homedir(), '.npm-global', 'bin'),
];

/** GUI apps on macOS get a tiny PATH. Find binaries the way a login shell would. */
export function findBinary(name: string): string | null {
  for (const d of CANDIDATE_DIRS) {
    const p = path.join(d, name);
    if (existsSync(p)) return p;
  }
  try {
    const out = execSync(`/bin/zsh -lc 'command -v ${name}'`, { encoding: 'utf8', timeout: 5000 }).trim();
    if (out && existsSync(out)) return out;
  } catch { /* ignore */ }
  return null;
}

let cached: Record<string, string | null> = {};
export function binary(name: string): string | null {
  if (!(name in cached)) cached[name] = findBinary(name);
  return cached[name];
}

export function shellEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.PATH = [...CANDIDATE_DIRS, env.PATH ?? ''].join(':');
  // We launch `claude` from inside the app; strip markers of an outer Claude Code session.
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
  }
  return env;
}
