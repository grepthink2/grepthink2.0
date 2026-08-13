import React from 'react';

/**
 * Task tag chip — fixed preset palette for the 10 GrepThink work tags.
 * Token-derived soft-bg/text pairs; no new colors.
 */
export const TASK_TAGS = ['backend', 'frontend', 'ui/ux', 'infra', 'design', 'research', 'bug', 'chore', 'optimization', 'docs'];

export function TagBadge({ tag, onRemove, className = '', ...rest }) {
  const slug = String(tag).toLowerCase().replace('/', '');
  return (
    <span className={['gt-tagbadge', `gt-tagbadge--${slug}`, className].filter(Boolean).join(' ')} {...rest}>
      {tag}
      {onRemove && (
        <button type="button" className="gt-tagbadge__remove" aria-label={`Remove tag ${tag}`} onClick={onRemove}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
        </button>
      )}
    </span>
  );
}
