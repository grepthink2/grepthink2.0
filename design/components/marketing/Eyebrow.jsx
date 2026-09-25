import React from 'react';

/**
 * Uppercase pill label above a marketing headline. Optional NEW / SOON
 * badge; `tone="amber"` for coming-soon features. Text is #016547 on the
 * green tint (6.3:1) — the hero's old #018156 was ~4.3:1.
 */
export function Eyebrow({ children, badge, tone = 'green', className = '' }) {
  return (
    <span className={['gt-eyebrow', tone === 'amber' ? 'gt-eyebrow--amber' : '', className].filter(Boolean).join(' ')}>
      {badge && <b className="gt-eyebrow__badge">{badge}</b>}
      {children}
    </span>
  );
}

/** Standalone NEW / SOON badge (white on #018156 / #8A5200). */
export function MarketingBadge({ children = 'NEW', tone = 'new', className = '' }) {
  return <b className={['gt-mkt-badge', tone === 'soon' ? 'gt-mkt-badge--soon' : '', className].filter(Boolean).join(' ')}>{children}</b>;
}
