/**
 * `react-router-dom` in the design-system bundle. A canvas or a preview has no router, so the kit's
 * `Link` (Button's `to`, Card's `to`, Table's `rowTo`) is a plain anchor to the same address, and
 * the props only a router reads are dropped rather than written onto the anchor.
 */
import type { AnchorHTMLAttributes, Ref } from 'react';

type Path = { pathname?: string; search?: string; hash?: string };

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string | Path;
  ref?: Ref<HTMLAnchorElement>;
  reloadDocument?: boolean;
  replace?: boolean;
  state?: unknown;
  preventScrollReset?: boolean;
  relative?: 'route' | 'path';
  viewTransition?: boolean;
  discover?: string;
  prefetch?: string;
  defaultShouldRevalidate?: boolean;
  mask?: unknown;
};

const hrefOf = (to: string | Path) =>
  typeof to === 'string' ? to : (to.pathname ?? '') + (to.search ?? '') + (to.hash ?? '');

export function Link({
  to,
  reloadDocument: _reloadDocument,
  replace: _replace,
  state: _state,
  preventScrollReset: _preventScrollReset,
  relative: _relative,
  viewTransition: _viewTransition,
  discover: _discover,
  prefetch: _prefetch,
  defaultShouldRevalidate: _defaultShouldRevalidate,
  mask: _mask,
  ...rest
}: LinkProps) {
  return <a href={hrefOf(to)} {...rest} />;
}
