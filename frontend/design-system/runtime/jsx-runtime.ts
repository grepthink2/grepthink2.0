/**
 * The JSX runtime of the design-system build and its tests (`react/jsx-runtime` and
 * `react/jsx-dev-runtime` both resolve here), built on `createElement` imported from `react` so
 * the same file serves the bundle (the page's React) and the tests (React 18 from npm). That
 * `createElement` is runtime/react.ts's, which hands a function component its `ref` as a prop.
 *
 * Children go to `createElement` as arguments, the way JSX compiled for `createElement` passes
 * them: the static children of `jsxs` one by one, so React does not ask them for keys, and the
 * children of `jsx` as one argument, so a list without keys is still reported.
 */
import { createElement, Fragment } from 'react';

export { Fragment };

type Props = Record<string, unknown>;

function element(type: unknown, props: Props, key: unknown, isStatic: boolean) {
  const make = createElement as (type: unknown, config: Props, ...children: unknown[]) => unknown;
  const { children, ...config } = props;
  if (key !== undefined) config.key = key;
  if (!('children' in props)) return make(type, config);
  if (isStatic && Array.isArray(children)) return make(type, config, ...children);
  return make(type, config, children);
}

export function jsx(type: unknown, props: Props, key?: unknown) {
  return element(type, props, key, false);
}

export function jsxs(type: unknown, props: Props, key?: unknown) {
  return element(type, props, key, true);
}

export function jsxDEV(type: unknown, props: Props, key: unknown, isStatic: boolean) {
  return element(type, props, key, isStatic);
}
