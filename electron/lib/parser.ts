/**
 * Turn whatever the user (or GPT, or the API) produced into the unified spec format.
 * All three input methods funnel through here. Downstream never cares about origin.
 */
export interface ParsedSpec {
  name: string;
  tags: string[];
  markdown: string;
}

const SECTION_ALIASES: Record<string, string[]> = {
  'Overview': ['overview', 'summary', '概述', '概览', 'description', '描述', '一句话'],
  'Visual States': ['visual states', 'states', 'state', '视觉状态', '状态', 'appearance', '外观'],
  'Interactions & Timing': ['interaction', 'interactions', 'timing', 'animation', 'animations', '交互', '动画', '时序', 'motion', 'behavior', 'behaviour'],
  'Technical Approach': ['technical', 'tech', 'implementation', '技术', '实现', 'approach', 'how to build', 'stack'],
  'Tags': ['tags', 'keywords', '标签', '关键词'],
};

export const SPEC_SECTIONS = Object.keys(SECTION_ALIASES);

function canonicalHeading(h: string): string | null {
  const s = h.toLowerCase().replace(/[#*:：\s]+/g, ' ').trim();
  for (const [canon, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some((a) => s.includes(a))) return canon;
  }
  return null;
}

export function parseSpec(input: string): ParsedSpec {
  const text = input.replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n');

  // name: first H1, else first "Name:" line, else first non-empty line
  let name = '';
  const h1 = lines.find((l) => /^#\s+/.test(l));
  if (h1) name = h1.replace(/^#\s+/, '').trim();
  if (!name) {
    const nl = lines.find((l) => /^\s*(name|title|名称|标题)\s*[:：]/i.test(l));
    if (nl) name = nl.split(/[:：]/).slice(1).join(':').trim();
  }
  if (!name) name = (lines.find((l) => l.trim()) ?? 'Untitled Pattern').replace(/^[#*\s-]+/, '').slice(0, 60);

  // tags: "tags: a, b" line or a Tags section
  const tags = new Set<string>();
  const tagLine = lines.find((l) => /^\s*(tags?|标签|keywords?)\s*[:：]/i.test(l));
  if (tagLine) tagLine.split(/[:：]/).slice(1).join(':').split(/[,，、]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean).forEach((t) => tags.add(t));

  // sections
  const buckets: Record<string, string[]> = {};
  let current: string | null = null;
  const orphan: string[] = [];
  for (const l of lines) {
    const hm = l.match(/^#{1,4}\s+(.+)/);
    if (hm) {
      if (/^#\s/.test(l) && hm[1].trim() === name) continue; // skip title line
      const canon = canonicalHeading(hm[1]);
      current = canon ?? hm[1].trim();
      buckets[current] ??= [];
      continue;
    }
    (current ? buckets[current] : orphan).push(l);
  }
  if (buckets['Tags']) {
    buckets['Tags'].join(' ').split(/[,，、\n\-•]/).map((t) => t.trim().replace(/^#/, '')).filter((t) => t && t.length < 32).forEach((t) => tags.add(t));
  }

  const out: string[] = [`# ${name}`, ''];
  const orphanText = orphan.join('\n').trim();
  for (const sec of SPEC_SECTIONS) {
    if (sec === 'Tags') continue;
    let body = (buckets[sec] ?? []).join('\n').trim();
    if (sec === 'Overview' && !body && orphanText) body = orphanText;
    out.push(`## ${sec}`, '', body || '_（待补充）_', '');
  }
  // preserve any non-canonical sections verbatim
  for (const [k, v] of Object.entries(buckets)) {
    if (SPEC_SECTIONS.includes(k)) continue;
    out.push(`## ${k}`, '', v.join('\n').trim(), '');
  }
  if (orphanText && buckets['Overview']?.join('').trim()) out.push('## Raw Notes', '', orphanText, '');
  out.push('## Tags', '', [...tags].join(', ') || '_（待补充）_', '');

  return { name, tags: [...tags], markdown: out.join('\n') };
}

/** Make an ascii slug; Chinese-only names fall back to a timestamp id. */
export function slugify(name: string): string {
  const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return s.length >= 3 ? s : `pattern-${Date.now().toString(36)}`;
}
