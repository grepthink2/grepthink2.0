import * as React from 'react';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'aria-disabled' | 'aria-busy'> {
  children: React.ReactNode;
  /**
   * Set by the button from `loading` / `disabled` and `pressed`, after the caller's props. JSX takes any
   * hyphenated prop a type leaves out, so they are declared `never` rather than only omitted (adopted from the codebase).
   */
  'aria-disabled'?: never;
  'aria-busy'?: never;
  'aria-pressed'?: never;
  /**
   * primary (one per view) · secondary (grey fill, inside white surfaces) · outline (white + 1px border:
   * Cancel, page-toolbar actions, anything on the grey canvas) · ghost (green text, low-emphasis links) ·
   * danger (solid red, only for the confirming step) · danger-ghost (quiet destructive: Remove / Unsend / Delete in rows).
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost';
  /** sm 32 (rows, cards, toolbars) · md 40 (forms, pages) · lg 48 (sign-in pages, with `fullWidth`). 44 minimum under 768px. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** @default 'button' */
  type?: 'button' | 'submit' | 'reset';
  /** Renders an <a> with the same look (Join Zoom, Browse projects). */
  href?: string;
  /** Busy: spinner + `loadingLabel`; stays focusable (never the native `disabled`, even with `disabled`), ignores clicks, keeps its width; the hidden face is `aria-hidden`. A busy `href` link keeps `tabIndex={0}`. @default false */
  loading?: boolean;
  /** The "-ing…" label shown while busy ("Saving…"). Pass it up front so the width is reserved. Defaults to the idle label. */
  loadingLabel?: React.ReactNode;
  /** Native `disabled` on a button; on an `href` link: no destination, `role="link"`, `aria-disabled`, out of the tab order. */
  disabled?: boolean;
  /** Makes the button a toggle: rendered as `aria-pressed`. Leave undefined for a plain button. */
  pressed?: boolean;
  /** @default false */
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  target?: string;
  rel?: string;
}

/**
 * GrepThink button — six variants, three sizes, busy / pressed / link forms.
 */
export function Button(props: ButtonProps): React.JSX.Element;
