/**
 * React as the design-system build sees it: React 18 (the page's `window.React`, or React 18 from
 * npm in the tests), with what the kit uses from React 19 added. react18-plugin.ts routes every
 * `react` import here; the import below is the only one that reaches React itself.
 *
 * The exports are React 18.3.1's, named one by one: an import of anything else (a React 19 API the
 * kit starts to use) fails the build instead of reaching a page as `undefined`.
 *
 * - `createElement` and `cloneElement` hand a function component its `ref` as a prop (adapt.ts).
 * - `useEffectEvent` (React 19.2) is React's own when the page's React has it, else a stand-in:
 *   the latest callback, kept in a ref that is updated before layout effects run, behind a stable
 *   function. Like React's, it is for calling from effects and event handlers, not during render.
 */
import * as React from 'react';
import { isFunctionComponent, withRefProp } from './adapt';

const base: typeof React = (React as { default?: typeof React }).default ?? React;
const extra = base as unknown as Record<string, unknown>;

export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  createContext,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = base;
export const createFactory = extra.createFactory;
export const unstable_act = extra.unstable_act;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = extra.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

type Config = Record<string, unknown> | null | undefined;

export function createElement(type: unknown, config?: Config, ...children: unknown[]) {
  const make = base.createElement as (type: unknown, config: Config, ...children: unknown[]) => object;
  if (config?.ref == null || !isFunctionComponent(type)) return make(type, config, ...children);
  const { ref, ...rest } = config;
  return withRefProp(make(type, rest, ...children), ref);
}

export function cloneElement(element: React.ReactElement, config?: Config, ...children: unknown[]) {
  const clone = base.cloneElement as (element: object, config: Config, ...children: unknown[]) => object;
  if (config?.ref === undefined || !isFunctionComponent(element.type)) return clone(element, config, ...children);
  const { ref, ...rest } = config;
  return withRefProp(clone(element, rest, ...children), ref);
}

function useEffectEventStandIn<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = base.useRef(callback);
  base.useInsertionEffect(() => {
    latest.current = callback;
  });
  return base.useCallback((...args: Args) => latest.current(...args), []);
}

export const useEffectEvent: typeof useEffectEventStandIn =
  (base as { useEffectEvent?: typeof useEffectEventStandIn }).useEffectEvent ?? useEffectEventStandIn;

export default { ...base, createElement, cloneElement, useEffectEvent };
