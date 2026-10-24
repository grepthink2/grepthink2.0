import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { MarkdownText } from '../display/Markdown.jsx';

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
