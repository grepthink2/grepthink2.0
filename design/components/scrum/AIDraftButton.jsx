import React from 'react';

/**
 * "Draft with AI" affordance — sparkle ghost button for LLM-drafted
 * User Stories / Tasks (backed by a free-tier model, e.g. Cloudflare
 * Workers AI, via a serverless proxy — see the scrum handoff doc).
 */
export function AIDraftButton({
  children = 'Draft with AI',
  loading = false,
  disabled = false,
  size = 'md',
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      className={['gt-aidraft', `gt-aidraft--${size}`, loading ? 'gt-aidraft--loading' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="gt-aidraft__spinner" aria-hidden="true" />
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/>
          <path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" opacity=".7"/>
        </svg>
      )}
      {loading ? 'Drafting…' : children}
    </button>
  );
}
