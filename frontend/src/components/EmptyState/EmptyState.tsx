import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { GraduationCap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button/Button';
import './EmptyState.scss';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role' | 'children'> {
  /** The icon in the round well (page: 64px tinted; card: 36px sunken). Not shown for quiet or error. */
  icon?: ReactNode;
  /** The visible heading text. Never the HTML `title` attribute. */
  title: ReactNode;
  description?: ReactNode;
  /** The call to action: Button(s). */
  action?: ReactNode;
  /**
   * page · card (inside a card, chart or table row) · quiet (left-aligned text) · error (quiet, with a
   * "Try again" link, as `role="status"`; never a red panel). @default 'page'
   */
  variant?: 'page' | 'card' | 'quiet' | 'error';
  /** Tighter page padding. @default false */
  compact?: boolean;
  /** The title's heading level, from where it sits: h2 on a page, h3 in a section, p in a row. @default 'h3' */
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4' | 'p';
  /** Adds the "Try again" link (the error variant). */
  onRetry?: () => void;
  /** @default 'Try again' */
  retryLabel?: string;
  /** The error variant is `role="status"`. JSX would take a stray role, so it is declared `never`. */
  role?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * An empty, quiet or failed region, ported from design/components/feedback/EmptyState.jsx. `page`
 * centres a 64px tinted icon well, a 20px title, the description and the actions; `card` is the small
 * one inside a card or chart (a 36px sunken disc, a 13px title, a caption hint); `quiet` is a
 * left-aligned line with no well; `error` is the quiet look with a "Try again" link (`RefreshCw`),
 * announced as a status. The icon well is hidden from assistive tech, and `titleAs` sets the
 * title's heading level for where the region sits.
 *
 * Native props and `ref` reach the region's box.
 */
export function EmptyState({
  icon, title, description, action, variant = 'page', compact = false, titleAs: Title = 'h3', onRetry,
  retryLabel = 'Try again', className = '', ref, ...rest
}: EmptyStateProps) {
  const quiet = variant === 'quiet' || variant === 'error';
  return (
    <div
      {...rest}
      ref={ref}
      className={[
        'gt-empty',
        variant !== 'page' ? `gt-empty--${variant}` : '',
        compact ? 'gt-empty--compact' : '',
        className,
      ].filter(Boolean).join(' ')}
      role={variant === 'error' ? 'status' : undefined}
    >
      {icon && !quiet && <div className="gt-empty__icon" aria-hidden="true">{icon}</div>}
      <Title className="gt-empty__title">{title}</Title>
      {description && <p className="gt-empty__desc">{description}</p>}
      {(action || onRetry) && (
        <div className="gt-empty__action">
          {action}
          {onRetry && (
            <button type="button" className="gt-empty__retry" onClick={onRetry}>
              <RefreshCw size={13} aria-hidden="true" />
              {retryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface NoClassSelectedProps {
  /** Opens the class selector, and renders the "Choose a class" button. */
  onSelectClass?: () => void;
  /** @default 'page' */
  variant?: 'page' | 'card';
  /** @default 'h2' */
  titleAs?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/**
 * The one "No class selected" state for the pages that need a class, ported from
 * design/components/feedback/EmptyState.jsx: a graduation cap, "No class selected", how to pick
 * one, and an outline "Choose a class" when `onSelectClass` is given. The app passes
 * `openClassSelector` (lib/openClassSelector); the component knows nothing about the shell.
 */
export function NoClassSelected({ onSelectClass, variant = 'page', titleAs = 'h2', className = '' }: NoClassSelectedProps) {
  return (
    <EmptyState
      variant={variant}
      titleAs={titleAs}
      className={className}
      icon={<GraduationCap size={28} aria-hidden="true" />}
      title="No class selected"
      description="Choose a class to see this page. You can switch classes any time from the class selector."
      action={onSelectClass && <Button variant="outline" onClick={onSelectClass}>Choose a class</Button>}
    />
  );
}
