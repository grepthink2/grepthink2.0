import React from 'react';
import { AssistantIcon } from '../assistant/AssistantIcon.jsx';

/**
 * "Draft with AI" affordance — ghost button for LLM-drafted User Stories /
 * Tasks (backed by a free-tier model, e.g. Cloudflare Workers AI, via a
 * serverless proxy — see the scrum handoff doc). Carries the Project
 * assistant's spark (AssistantIcon) so the product has one assistant mark.
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
        <AssistantIcon size={size === 'sm' ? 12 : 13} />
      )}
      {loading ? 'Drafting…' : children}
    </button>
  );
}
