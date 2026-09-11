import React from 'react';

/**
 * Empty state — round tinted icon well, title, sub-line, optional action.
 * Mirrors the app's "submitted" screens and empty lists.
 */
export function EmptyState({ icon = null, title, description, action = null, compact = false, className = '' }) {
  return (
    <div className={['gt-empty', compact ? 'gt-empty--compact' : '', className].filter(Boolean).join(' ')}>
      {icon && <div className="gt-empty__icon">{icon}</div>}
      <h3 className="gt-empty__title">{title}</h3>
      {description && <p className="gt-empty__desc">{description}</p>}
      {action && <div className="gt-empty__action">{action}</div>}
    </div>
  );
}

/** Loading placeholder block with shimmer (mirrors _skeleton.scss). */
export function Skeleton({ width = '100%', height = 14, radius, circle = false, className = '', style }) {
  return (
    <span
      className={['gt-skeleton', className].filter(Boolean).join(' ')}
      style={{
        width,
        height,
        borderRadius: circle ? '50%' : radius,
        display: 'block',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}
