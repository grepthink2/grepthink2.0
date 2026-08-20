import React from 'react';

/**
 * GrepThink primary action button.
 * Variants: primary (green CTA), secondary (grey), ghost (transparent), danger (destructive).
 * Sizes: sm / md / lg. Supports loading spinner, disabled, and left/right icon slots.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled = false,
  fullWidth = false,
  iconLeft = null,
  iconRight = null,
  onClick,
  className = '',
  ...rest
}) {
  const cls = [
    'gt-button',
    `gt-button--${variant}`,
    `gt-button--${size}`,
    fullWidth ? 'gt-button--full' : '',
    loading ? 'gt-button--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      {...rest}
    >
      {loading && <span className="gt-button__spinner" aria-hidden="true" />}
      {!loading && iconLeft && <span className="gt-button__icon">{iconLeft}</span>}
      <span className="gt-button__label">{children}</span>
      {!loading && iconRight && <span className="gt-button__icon">{iconRight}</span>}
    </button>
  );
}
