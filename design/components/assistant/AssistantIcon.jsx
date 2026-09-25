import React from 'react';

/**
 * The Project assistant's mark. Two directions were explored:
 *  - 'spark'  (CHOSEN) — the AIDraftButton sparkle redrawn in Lucide's line
 *    (24 viewBox, 2px stroke, round caps): one four-point star + a small
 *    cross-spark. Keeps the recognition the scrum board already built
 *    around "Draft with AI", and its stroke weight now matches the icons
 *    beside it (the filled version read heavier than everything else).
 *  - 'merge'  (runner-up) — a git-merge line that ends in a check: literal
 *    for "PR merged → task done", but at 16px it collides with PRLinkChip's
 *    branch glyph and reads as a PR state, not an assistant.
 */
export function AssistantIcon({ size = 16, variant = 'spark', title, className = '', ...rest }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', className: ['gt-asst-icon', className].filter(Boolean).join(' '), 'aria-hidden': title ? undefined : true, role: title ? 'img' : undefined, ...rest };
  if (variant === 'merge') {
    return (
      <svg {...common}>{title && <title>{title}</title>}
        <circle cx="6" cy="5" r="2.5" />
        <path d="M6 7.5v6.5a4 4 0 0 0 4 4h2" />
        <path d="m13.5 16.5 2.5 2.5L21 13" />
      </svg>
    );
  }
  return (
    <svg {...common}>{title && <title>{title}</title>}
      <path d="M11 4c.5 3.9 3.1 6.5 7 7-3.9.5-6.5 3.1-7 7-.5-3.9-3.1-6.5-7-7 3.9-.5 6.5-3.1 7-7Z" />
      <path d="M19 3v4M17 5h4" />
    </svg>
  );
}

/** 26px green-50 tile holding the mark — the assistant's "avatar". */
export function AssistantMark({ size = 'md', variant = 'spark', className = '' }) {
  return (
    <span className={['gt-asst-mark', `gt-asst-mark--${size}`, className].filter(Boolean).join(' ')} aria-hidden="true">
      <AssistantIcon size={size === 'sm' ? 13 : size === 'lg' ? 18 : 15} variant={variant} />
    </span>
  );
}
