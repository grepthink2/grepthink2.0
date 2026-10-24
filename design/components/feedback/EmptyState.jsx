import React from 'react';
import { Button } from '../primitives/Button.jsx';

const G = ({ children, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

/**
 * Empty state. Variants: `page` (64px tinted icon well, 20px title) · `card` (inside a card or
 * table: 36px sunken disc, 13px title — analytics' `.gt-empty--card`) · `quiet` (left-aligned
 * text, no icon well — the schedule's) · `error` (quiet text + a "Try again" link; never a red
 * panel). The heading level comes from the context (`titleAs`).
 */
export function EmptyState({
  icon = null, title, description, action = null, variant = 'page', compact = false, titleAs = 'h3',
  onRetry, retryLabel = 'Try again', className = '',
}) {
  const T = titleAs;
  const quiet = variant === 'quiet' || variant === 'error';
  return (
    <div className={['gt-empty', variant !== 'page' ? `gt-empty--${variant}` : '', compact ? 'gt-empty--compact' : '', className].filter(Boolean).join(' ')}
      role={variant === 'error' ? 'status' : undefined}>
      {icon && !quiet && <div className="gt-empty__icon" aria-hidden="true">{icon}</div>}
      <T className="gt-empty__title">{title}</T>
      {description && <p className="gt-empty__desc">{description}</p>}
      {(action || onRetry) && (
        <div className="gt-empty__action">
          {action}
          {onRetry && (
            <button type="button" className="gt-empty__retry" onClick={onRetry}>
              <G size={13}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></G>
              {retryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "No class selected" — written once for the 14 pages that need a class. The action opens the class selector. */
export function NoClassSelected({ onSelectClass, variant = 'page', titleAs = 'h2', className = '' }) {
  return (
    <EmptyState
      variant={variant}
      titleAs={titleAs}
      className={className}
      icon={<G size={28}><path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" /><path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></G>}
      title="No class selected"
      description="Choose a class to see this page. You can switch classes any time from the class selector."
      action={onSelectClass && <Button variant="outline" onClick={onSelectClass}>Choose a class</Button>}
    />
  );
}

/** Loading placeholder block with shimmer (mirrors _skeleton.scss). */
export function Skeleton({ width = '100%', height = 14, radius, circle = false, className = '', style }) {
  return (
    <span
      className={['gt-skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: circle ? '50%' : radius, display: 'block', ...style }}
      aria-hidden="true"
    />
  );
}
