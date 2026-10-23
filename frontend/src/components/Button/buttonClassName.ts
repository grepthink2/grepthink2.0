export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonClassOptions {
  /** @default 'primary' */
  variant?: ButtonVariant;
  /** @default 'md' */
  size?: ButtonSize;
  fullWidth?: boolean;
  /** The busy look (a progress cursor); Button sets it with `loading`. */
  loading?: boolean;
  className?: string;
}

/**
 * The classes Button renders, for the rare element that cannot be a Button (a `<label>` that
 * opens a file picker, say). Pressed and disabled are attributes in the design (`aria-pressed`,
 * `:disabled` / `aria-disabled`), not classes, so the element sets those itself.
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  className = '',
}: ButtonClassOptions = {}): string {
  return [
    'gt-button',
    `gt-button--${variant}`,
    `gt-button--${size}`,
    fullWidth ? 'gt-button--full' : '',
    loading ? 'gt-button--loading' : '',
    className,
  ].filter(Boolean).join(' ');
}
