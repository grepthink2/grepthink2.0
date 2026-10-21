import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { CircleCheckBig, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import './Alert.scss';

export type AlertTone = 'success' | 'warning' | 'error' | 'info';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role' | 'children'> {
  /** error is `role="alert"`, announced at once; the others are `role="status"`. @default 'info' */
  tone?: AlertTone;
  /** The bold first line. Visible text, never the HTML `title` attribute. */
  title?: ReactNode;
  /** The body, a `<div>`: paragraphs and links both fit. */
  children?: ReactNode;
  /** Buttons under the body: `Button size="sm" variant="outline"` (Try again, Restore draft, Discard). */
  actions?: ReactNode;
  /** Adds a "Dismiss" × for a condition the user may hide. */
  onDismiss?: () => void;
  /** Set from `tone`. JSX would take a stray role, so it is declared `never`. */
  role?: never;
  ref?: Ref<HTMLDivElement>;
}

const ICONS = { success: CircleCheckBig, warning: TriangleAlert, error: CircleX, info: Info } as const;

/**
 * Inline alert for a condition that lasts until something changes (preview mode, a failed load, a
 * save error above a form's actions), ported from design/components/feedback/Alert.jsx: the tone's
 * soft fill and text colour, a 16px icon, an optional bold title, the body, and `actions` under it.
 * An error alert is `role="alert"`, so mount it when the error happens; the other tones are polite
 * `role="status"` messages. A passing confirmation is a Toast instead, and a field's error sits
 * under its field.
 *
 * Native props and `ref` reach the alert's box.
 */
export function Alert({ tone = 'info', title, children, actions, onDismiss, className = '', ref, ...rest }: AlertProps) {
  const Icon = ICONS[tone];
  return (
    <div
      {...rest}
      ref={ref}
      className={['gt-alert', `gt-alert--${tone}`, className].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className="gt-alert__icon"><Icon size={16} aria-hidden="true" /></span>
      <div className="gt-alert__content">
        {title && <p className="gt-alert__title">{title}</p>}
        {children && <div className="gt-alert__text">{children}</div>}
        {actions && <div className="gt-alert__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="gt-alert__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
