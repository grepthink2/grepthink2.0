import React from 'react';
import { Avatar } from '../display/Avatar.jsx';

/* Minimal markdown for demos: **bold**, *italic*, `code`, [link](url),
   "- " lists, @mentions. Production uses the codebase's existing
   markdown + mention semantics — this renderer is design-fidelity only. */
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

/** Tiny markdown renderer (demo fidelity — see note above). */
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

/**
 * Comment thread for stories & tasks — markdown bodies, @mentions of
 * project-team members, and a composer with a mention hint.
 */
export function CommentThread({
  comments = [],
  members = [],
  value = '',
  onChange,
  onSubmit,
  placeholder = 'Add a comment… (markdown supported, @ to mention)',
  className = '',
}) {
  const submit = () => {
    if (!value.trim()) return;
    onSubmit && onSubmit(value.trim());
  };
  return (
    <div className={['gt-comments', className].filter(Boolean).join(' ')}>
      {comments.map((c, i) => (
        <div key={i} className="gt-comments__item">
          <Avatar name={c.author} size="sm" />
          <div className="gt-comments__body">
            <div className="gt-comments__meta">
              <span className="gt-comments__author">{c.author}</span>
              {c.time && <span className="gt-comments__time">{c.time}</span>}
            </div>
            <MarkdownText members={members}>{c.body}</MarkdownText>
          </div>
        </div>
      ))}
      <div className="gt-comments__composer">
        <textarea
          className="gt-comments__input"
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          aria-label="Comment"
        />
        <div className="gt-comments__composer-row">
          <span className="gt-comments__hint">**bold** · `code` · @mention teammates</span>
          <button type="button" className="gt-comments__send" onClick={submit} disabled={!value.trim()}>Comment</button>
        </div>
      </div>
    </div>
  );
}
