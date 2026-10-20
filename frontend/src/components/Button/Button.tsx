import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, MouseEventHandler, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Spinner } from '@/components/Spinner/Spinner';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonClassName';
import './Button.scss';

interface ButtonOwnProps {
  /**
   * primary (one per view) · secondary (grey fill, inside white surfaces) · outline (Cancel, page
   * toolbars, anything on the grey canvas) · ghost (green text, tertiary) · danger (solid red, only
   * the confirming step) · danger-ghost (quiet destructive in rows). @default 'primary'
   */
  variant?: ButtonVariant;
  /** sm 32 (rows, cards, toolbars) · md 40 (forms, pages) · lg 48 (sign-in pages); 44 minimum under 768px. @default 'md' */
  size?: ButtonSize;
  /** Busy: the spinner and `loadingLabel` take the label's place. The button keeps focus and ignores clicks. @default false */
  loading?: boolean;
  /** The "-ing…" label shown while busy ("Saving…"). Pass it up front, so its width is reserved. Defaults to the label. */
  loadingLabel?: ReactNode;
  /** @default false */
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  children: ReactNode;
}

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-pressed'> & {
  /** Makes the button a toggle, rendered as `aria-pressed`. Leave undefined for a plain button. */
  pressed?: boolean;
  href?: never;
  to?: never;
  ref?: Ref<HTMLButtonElement>;
};

type AnchorButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'> & {
  /** Renders an `<a>` with the button's look (Join Zoom). */
  href: string;
  to?: never;
  /** A link cannot be disabled: it renders without its `href`, with `aria-disabled`. */
  disabled?: boolean;
  pressed?: never;
  ref?: Ref<HTMLAnchorElement>;
};

type RouterButtonProps = Omit<LinkProps, 'className' | 'children' | 'to'> & {
  /** Renders a react-router `Link` with the button's look (Browse projects). */
  to: LinkProps['to'];
  href?: never;
  /** As for `href`: rendered as an `<a>` without a destination, with `aria-disabled`. */
  disabled?: boolean;
  pressed?: never;
  ref?: Ref<HTMLAnchorElement>;
};

export type ButtonProps = ButtonOwnProps & (NativeButtonProps | AnchorButtonProps | RouterButtonProps);

/**
 * The props a react-router Link takes and an <a> does not. A `to` link that renders without its
 * destination is a plain <a>, which must not get them. Checked against LinkProps, so a router
 * upgrade that adds one fails the build until it is listed here.
 */
const ROUTER_ONLY = {
  discover: true,
  prefetch: true,
  reloadDocument: true,
  replace: true,
  state: true,
  preventScrollReset: true,
  relative: true,
  viewTransition: true,
  defaultShouldRevalidate: true,
  mask: true,
} satisfies Record<Exclude<keyof LinkProps, keyof AnchorHTMLAttributes<HTMLAnchorElement> | 'to'>, true>;

function withoutRouterProps<T extends object>(props: T): Omit<T, keyof typeof ROUTER_ONLY> {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !(key in ROUTER_ONLY))) as Omit<T, keyof typeof ROUTER_ONLY>;
}

/**
 * GrepThink button, ported from design/components/primitives/Button.jsx. Six variants, three sizes.
 *
 * Busy (`loading`): a spinner and `loadingLabel` replace the idle face in the same grid cell, so the
 * width never changes. The button stays focusable and announces itself (`aria-disabled`,
 * `aria-busy`, never the native `disabled`, which would drop focus to the page), and a click, or an
 * Enter that would submit its form, is cancelled with `preventDefault()`. The face that is not
 * showing is `aria-hidden`, so the accessible name is the label you can see. `disabled` alone is
 * the native attribute. `type` defaults to `"button"`; `pressed` makes it a toggle (`aria-pressed`).
 *
 * `href` renders an `<a>`. Codebase addition: `to` renders a react-router `Link`. A disabled or
 * busy link renders without its destination, with `role="link"` and `aria-disabled`.
 */
export function Button(props: ButtonProps) {
  const {
    variant = 'primary', size = 'md', loading = false, loadingLabel, fullWidth = false, iconLeft, iconRight,
    className, children, ...rest
  } = props;
  const cls = buttonClassName({ variant, size, fullWidth, loading, className });
  const faces = (
    <span className="gt-button__faces">
      <span className="gt-button__face gt-button__face--idle" aria-hidden={loading || undefined}>
        {iconLeft ? <span className="gt-button__icon" aria-hidden="true">{iconLeft}</span> : null}
        <span className="gt-button__label">{children}</span>
        {iconRight ? <span className="gt-button__icon" aria-hidden="true">{iconRight}</span> : null}
      </span>
      {(loading || loadingLabel != null) && (
        <span className="gt-button__face gt-button__face--busy" aria-hidden={!loading || undefined}>
          <Spinner size={size === 'sm' ? 14 : 16} decorative />
          <span className="gt-button__label">{loadingLabel ?? children}</span>
        </span>
      )}
    </span>
  );

  // What a link adds to the caller's props. A disabled or busy one keeps its look and loses its
  // destination; a click on it does nothing.
  const linkLook = (inert: boolean, onClick?: MouseEventHandler<HTMLAnchorElement>) => ({
    className: cls,
    'aria-busy': loading || undefined,
    ...(inert ? { role: 'link', 'aria-disabled': true } : {}),
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (inert) e.preventDefault();
      else onClick?.(e);
    },
  });

  if (rest.to !== undefined) {
    const { to, disabled = false, onClick, ref, ...routed } = rest;
    if (!disabled && !loading) {
      return <Link {...routed} {...linkLook(false, onClick)} ref={ref} to={to}>{faces}</Link>;
    }
    return <a {...withoutRouterProps(routed)} {...linkLook(true, onClick)} ref={ref}>{faces}</a>;
  }

  if (rest.href !== undefined) {
    const { href, disabled = false, onClick, ref, ...anchor } = rest;
    const inert = disabled || loading;
    return <a {...anchor} {...linkLook(inert, onClick)} ref={ref} href={inert ? undefined : href}>{faces}</a>;
  }

  const { type = 'button', disabled = false, pressed, onClick, ref, ...native } = rest;
  return (
    <button
      {...native}
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled && !loading}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      onClick={(e) => {
        if (loading) e.preventDefault();
        else onClick?.(e);
      }}
    >
      {faces}
    </button>
  );
}
