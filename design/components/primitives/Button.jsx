import React from 'react';
import { Spinner } from '../feedback/Spinner.jsx';

/**
 * GrepThink button. Variants: primary · secondary · outline · ghost · danger · danger-ghost.
 * Sizes sm 32 / md 40 / lg 48 (44 minimum on phones). `href` renders an <a> with the same classes.
 * Busy (`loading`): a spinner and the "-ing…" label (`loadingLabel`) replace the idle face in the
 * same grid cell, so the width never changes. The button stays focusable and announces itself
 * (`aria-disabled`, `aria-busy` — never the native `disabled`, even together with `disabled`, which
 * would drop focus to the page) and a click is cancelled. The face that is not showing is
 * `aria-hidden`, so the name is the label you can see. `disabled` alone is the native attribute.
 * `aria-disabled`, `aria-busy`, `aria-pressed` and the click guard apply after the caller's props.
 * A link cannot be disabled: it renders without its `href`, with `role="link"` + `aria-disabled`;
 * a disabled one leaves the tab order, a busy one keeps the focus it has (`tabIndex={0}`).
 * `pressed` makes it a toggle button (`aria-pressed`). Adopted from the codebase (PR #259).
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  href,
  loading = false,
  loadingLabel,
  disabled = false,
  pressed,
  fullWidth = false,
  iconLeft = null,
  iconRight = null,
  onClick,
  className = '',
  ...rest
}) {
  const cls = [
    'gt-button', `gt-button--${variant}`, `gt-button--${size}`,
    fullWidth ? 'gt-button--full' : '', loading ? 'gt-button--loading' : '', className,
  ].filter(Boolean).join(' ');
  const faces = (
    <span className="gt-button__faces">
      <span className="gt-button__face gt-button__face--idle" aria-hidden={loading || undefined}>
        {iconLeft && <span className="gt-button__icon" aria-hidden="true">{iconLeft}</span>}
        <span className="gt-button__label">{children}</span>
        {iconRight && <span className="gt-button__icon" aria-hidden="true">{iconRight}</span>}
      </span>
      {(loading || loadingLabel != null) && (
        <span className="gt-button__face gt-button__face--busy" aria-hidden={!loading || undefined}>
          <Spinner size={size === 'sm' ? 14 : 16} decorative />
          <span className="gt-button__label">{loadingLabel ?? children}</span>
        </span>
      )}
    </span>
  );

  if (href) {
    const inert = disabled || loading;
    return (
      <a
        {...rest}
        className={cls}
        href={inert ? undefined : href}
        aria-busy={loading || undefined}
        aria-disabled={inert || undefined}
        {...(inert ? { role: 'link', tabIndex: loading ? 0 : undefined } : {})}
        onClick={(e) => { if (inert) e.preventDefault(); else if (onClick) onClick(e); }}
      >
        {faces}
      </a>
    );
  }
  return (
    <button
      {...rest}
      type={type}
      className={cls}
      disabled={disabled && !loading}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      onClick={(e) => { if (loading) e.preventDefault(); else if (onClick) onClick(e); }}
    >
      {faces}
    </button>
  );
}
