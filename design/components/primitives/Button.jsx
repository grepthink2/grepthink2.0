import React from 'react';
import { Spinner } from '../feedback/Spinner.jsx';

/**
 * GrepThink button. Variants: primary · secondary · outline · ghost · danger · danger-ghost.
 * Sizes sm 32 / md 40 / lg 48 (44 minimum on phones). `href` renders an <a> with the same classes.
 * Busy: a spinner and the "-ing…" label (`loadingLabel`) replace the idle face in the same grid
 * cell, so the width never changes; the button stays focusable (`aria-disabled`) and ignores clicks.
 * `pressed` makes it a toggle button (`aria-pressed`).
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
  const inert = disabled || loading;
  const cls = [
    'gt-button', `gt-button--${variant}`, `gt-button--${size}`,
    fullWidth ? 'gt-button--full' : '', loading ? 'gt-button--loading' : '', className,
  ].filter(Boolean).join(' ');
  const handleClick = (e) => {
    if (inert) { e.preventDefault(); return; }
    if (onClick) onClick(e);
  };
  const faces = (
    <span className="gt-button__faces">
      <span className="gt-button__face gt-button__face--idle">
        {iconLeft && <span className="gt-button__icon" aria-hidden="true">{iconLeft}</span>}
        <span className="gt-button__label">{children}</span>
        {iconRight && <span className="gt-button__icon" aria-hidden="true">{iconRight}</span>}
      </span>
      {(loading || loadingLabel != null) && (
        <span className="gt-button__face gt-button__face--busy">
          <Spinner size={size === 'sm' ? 14 : 16} decorative />
          <span className="gt-button__label">{loadingLabel ?? children}</span>
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <a className={cls} href={inert ? undefined : href} role={inert ? 'link' : undefined}
        aria-disabled={inert || undefined} aria-busy={loading || undefined} onClick={handleClick} {...rest}>
        {faces}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      onClick={handleClick}
      {...rest}
    >
      {faces}
    </button>
  );
}
