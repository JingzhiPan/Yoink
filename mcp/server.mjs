#!/usr/bin/env node
/**
 * YOINK MCP server — thinnest possible layer over the pattern library on disk.
 * No auth, no network. Register with:
 *   claude mcp add --scope user yoink -- node /path/to/Yoink/mcp/server.mjs
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

const ROOT = process.env.YOINK_LIBRARY ?? path.join(homedir(), 'yoink');
const dir = (id) => path.join(ROOT, id);

async function listMeta() {
  if (!existsSync(ROOT)) return [];
  const out = [];
  for (const e of await readdir(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try { out.push(JSON.parse(await readFile(path.join(ROOT, e.name, 'meta.json'), 'utf8'))); } catch { /* skip */ }
  }
  return out;
}
async function pngs(p) {
  if (!existsSync(p)) return [];
  return (await readdir(p)).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort().map((f) => path.join(p, f));
}
async function walk(d, base = d) {
  if (!existsSync(d)) return [];
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, base))); else out.push(p);
  }
  return out.sort();
}
const text = (s) => ({ content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] });
const fail = (m) => ({ content: [{ type: 'text', text: m }], isError: true });
const brief = (m) => ({ id: m.id, name: m.name, tags: m.tags, category: m.category, complexity: m.complexity, status: m.status, tech_hints: m.tech_hints, notes: m.notes });

const server = new McpServer({ name: 'yoink', version: '0.1.0' });

server.registerTool('search_patterns', {
  description: 'Search the local YOINK library of verified UI interaction patterns (animations, micro-interactions, transitions, layouts…). Keyword match over name/tags/notes/tech_hints. Use before implementing any non-trivial UI effect: if a pattern exists, call get_skill / get_spec and reuse it.',
  inputSchema: { query: z.string().describe('keywords, e.g. "gooey button" or "radial menu spring"'), tags: z.array(z.string()).optional(), status: z.string().optional().describe('filter by status, e.g. skill_ready') },
}, async ({ query, tags, status }) => {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = await listMeta();
  const scored = all.map((m) => {
    const hay = [m.name, m.id, m.notes, m.category, ...(m.tags ?? []), ...(m.tech_hints ?? [])].join(' ').toLowerCase();
    const score = q.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) + (q.length === 0 ? 1 : 0);
    return { m, score };
  }).filter(({ m, score }) => score > 0 && (!status || m.status === status) && (!tags?.length || tags.every((t) => (m.tags ?? []).map((x) => x.toLowerCase()).includes(t.toLowerCase()))))
    .sort((a, b) => b.score - a.score);
  return text(scored.map(({ m }) => brief(m)));
});

server.registerTool('get_spec', {
  description: 'Return the verified spec.md (visual states, interactions & timing, technical approach) of a pattern.',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => {
  const p = path.join(dir(pattern_id), 'spec.md');
  if (!existsSync(p)) return fail(`pattern ${pattern_id} has no verified spec yet`);
  return text(await readFile(p, 'utf8'));
});

server.registerTool('get_refs', {
  description: 'Return absolute paths of the reference photos (refs/) of a pattern, for patterns built from material references instead of a video.',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => {
  const rd = path.join(dir(pattern_id), 'refs');
  if (!existsSync(rd)) return text([]);
  return text((await readdir(rd)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().map((f) => path.join(rd, f)));
});

server.registerTool('get_frames', {
  description: 'Return absolute paths of the key frames extracted from the original demo video. Read them with your image-reading tool for visual reference.',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => text(await pngs(path.join(dir(pattern_id), 'frames'))));

server.registerTool('get_demo_screenshots', {
  description: 'Return absolute paths of screenshots taken from the generated working demo (one per interaction state).',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => text(await pngs(path.join(dir(pattern_id), 'demo-screenshots'))));

server.registerTool('get_handoff', {
  description: 'Return the handoff page of a pattern: what the video proves (core rule, material layer stack), what the user decided (do not "fix" these back), what is still undecided, craft details, and the list of tunable CSS variables in the demo. Read this before modifying or reusing a pattern.',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => {
  const p = path.join(dir(pattern_id), 'handoff.md');
  if (!existsSync(p)) return fail(`pattern ${pattern_id} has no handoff yet (open it in YOINK once)`);
  return text(await readFile(p, 'utf8'));
});

server.registerTool('get_traits', {
  description: 'Return traits.json: the pattern taken apart into parts — structure (outline path, layout rule, states), material (word, realism, one-line rule, light, layers), motion (trigger/curve/duration/dependencies), replaceable tokens with safe ranges, and fixed constraints. Use it to port a pattern to another brand/stack (change only replaceable), combine patterns (align light/timing, respect fixed), or build a family.',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => {
  const p = path.join(dir(pattern_id), 'traits.json');
  if (!existsSync(p)) return fail(`pattern ${pattern_id} has no traits yet (confirm its demo in YOINK)`);
  return text(JSON.parse(await readFile(p, 'utf8')));
});

const LEAVES = path.join(ROOT, '_skills');
server.registerTool('list_leaves', {
  description: 'List leaf skills grown from confirmed patterns: one page per material / geometry / motion problem (materials/latex, geometry/thin-shell, motion/spring …) with match words. Load the relevant one with get_leaf before implementing a similar material, shape or motion.',
  inputSchema: {},
}, async () => {
  const out = [];
  for (const kind of ['materials', 'geometry', 'motion']) {
    const d = path.join(LEAVES, kind); if (!existsSync(d)) continue;
    for (const f of (await readdir(d)).filter((x) => x.endsWith('.md'))) {
      const t = await readFile(path.join(d, f), 'utf8');
      out.push({ kind, slug: f.replace(/\.md$/, ''), match: t.match(/^match:\s*\[(.*)\]/m)?.[1] ?? '', from: t.match(/^from:\s*(.*)$/m)?.[1] ?? '' });
    }
  }
  return text(out);
});
server.registerTool('get_leaf', {
  description: 'Return one leaf skill (markdown): rule, channels/structure, recipe, pitfalls, tweak suggestions.',
  inputSchema: { kind: z.enum(['materials', 'geometry', 'motion']), slug: z.string() },
}, async ({ kind, slug }) => {
  const p = path.join(LEAVES, kind, slug.replace(/[^a-z0-9-]/g, '-') + '.md');
  if (!existsSync(p)) return fail(`no leaf ${kind}/${slug}`);
  return text(await readFile(p, 'utf8'));
});

server.registerTool('port_brief', {
  description: 'Everything needed to port a pattern into your own codebase: traits (replaceable tokens with safe ranges, fixed constraints), the handoff page, and the reusable component files. Rule: change only what traits.replaceable allows, carry traits.fixed verbatim, keep the material layer stack and light convention.',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => {
  const d0 = dir(pattern_id);
  const tp = path.join(d0, 'traits.json');
  if (!existsSync(tp)) return fail(`pattern ${pattern_id} has no traits yet (confirm its demo in YOINK)`);
  const sd = path.join(d0, 'skill');
  const files = existsSync(sd) ? (await walk(sd)).filter((f) => /component\//.test(f)) : [];
  return text({ rule: 'Change only traits.replaceable within its stated range. Carry every traits.fixed item verbatim. Keep the material layers, their path references and the light convention. If a requested change would violate a fixed item, refuse it and propose the nearest safe alternative.', traits: JSON.parse(await readFile(tp, 'utf8')), handoff: existsSync(path.join(d0, 'handoff.md')) ? await readFile(path.join(d0, 'handoff.md'), 'utf8') : null, component_files: files, demo: path.join(d0, 'demo', 'index.html') });
});

server.registerTool('get_skill', {
  description: 'Return the packaged skill: SKILL.md content plus absolute paths of the reusable component code. Only available when status is skill_ready (or demo_done with a generated skill).',
  inputSchema: { pattern_id: z.string() },
}, async ({ pattern_id }) => {
  const sd = path.join(dir(pattern_id), 'skill');
  const md = path.join(sd, 'SKILL.md');
  if (!existsSync(md)) return fail(`pattern ${pattern_id} has no skill yet`);
  const files = (await walk(sd)).filter((f) => f !== md);
  return text({ skill_md: await readFile(md, 'utf8'), files, demo: path.join(dir(pattern_id), 'demo', 'index.html') });
});

await server.connect(new StdioServerTransport());
