import React from 'react';

/* Minimal markdown: **bold**, *italic*, `code`, [link](url), "- " lists, @mentions. The codebase's
   components/Markdown/MarkdownText renders GFM; this renderer is design-fidelity only. */
function inline(text, members) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|@[\w.-]+)/g;
  let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const s = m[0];
    if (s.startsWith('**')) out.push(<strong key={k++}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith('`')) out.push(<code key={k++} className="gt-md__code">{s.slice(1, -1)}</code>);
    else if (s.startsWith('*')) out.push(<em key={k++}>{s.slice(1, -1)}</em>);
    else if (s.startsWith('[')) {
      const t = s.slice(1, s.indexOf(']'));
      const u = s.slice(s.indexOf('(') + 1, -1);
      out.push(<a key={k++} className="gt-md__link" href={u} target="_blank" rel="noreferrer">{t}</a>);
    } else {
      const name = s.slice(1);
      const known = !members || members.some((mm) => mm.toLowerCase().replace(/\s+/g, '') === name.toLowerCase());
      out.push(known ? <span key={k++} className="gt-mention">@{name}</span> : s);
    }
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Markdown text (`.gt-md`) — the kit's renderer for comment bodies, story and task descriptions,
 * project descriptions and the MarkdownEditor's preview. Moved here from scrum/CommentThread.jsx
 * (fold-back 2026-10-22) to match the codebase's `components/Markdown/MarkdownText`. Demo fidelity:
 * paragraphs, "- " lists, bold, italic, code, links and @mentions of `members` (rendered as chips).
 */
export function MarkdownText({ children = '', members, className = '' }) {
  const blocks = [];
  let list = null;
  String(children).split('\n').forEach((line, i) => {
    if (line.trim().startsWith('- ')) {
      if (!list) { list = []; blocks.push(list); }
      list.push(<li key={i}>{inline(line.trim().slice(2), members)}</li>);
    } else {
      list = null;
      if (line.trim()) blocks.push(<p key={i}>{inline(line, members)}</p>);
    }
  });
  return (
    <div className={['gt-md', className].filter(Boolean).join(' ')}>
      {blocks.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b}</ul> : b))}
    </div>
  );
}

/** The file's renderer under the file's name, for the bundle (design-only, like ModKey). */
export const Markdown = { MarkdownText };
