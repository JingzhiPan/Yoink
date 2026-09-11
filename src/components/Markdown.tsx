/** Tiny dependency-free markdown → HTML for spec/skill previews. Good enough for headings, lists, code, bold, inline code. */
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}
export function mdToHtml(md: string): string {
  let body = md.replace(/\r\n/g, '\n');
  const out: string[] = [];
  // YAML frontmatter (SKILL.md) → render as a key/value block instead of two <hr>s
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = body.slice(fm[0].length);
    out.push('<div class="frontmatter">' + fm[1].split('\n').map((l) => { const m = l.match(/^(\w+):\s*(.*)$/); return m ? `<div><b>${esc(m[1])}</b> ${esc(m[2])}</div>` : `<div>${esc(l)}</div>`; }).join('') + '</div>');
  }
  const lines = body.split('\n');
  let inCode = false, inList: 'ul' | 'ol' | null = null, para: string[] = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  for (const raw of lines) {
    if (raw.startsWith('```')) { flushP(); closeList(); if (inCode) out.push('</pre>'); else out.push('<pre>'); inCode = !inCode; continue; }
    if (inCode) { out.push(esc(raw)); continue; }
    const h = raw.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushP(); closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^---+\s*$/.test(raw)) { flushP(); closeList(); out.push('<hr/>'); continue; }
    const li = raw.match(/^\s*([-*•]|\d+\.)\s+(.*)/);
    if (li) { flushP(); const kind = /\d/.test(li[1]) ? 'ol' : 'ul'; if (inList !== kind) { closeList(); out.push(`<${kind}>`); inList = kind; } out.push(`<li>${inline(li[2])}</li>`); continue; }
    if (!raw.trim()) { flushP(); closeList(); continue; }
    closeList(); para.push(raw);
  }
  flushP(); closeList(); if (inCode) out.push('</pre>');
  return out.join('\n');
}
export function Markdown({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}
