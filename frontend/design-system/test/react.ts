/**
 * React 18 for `npm run design:test`: the `react18` package's UMD build, the one a page loads, in
 * its development form. React DOM's UMD build (react-dom.ts) takes the scheduler from this build's
 * internals, which the CommonJS build does not carry, so the two are loaded as a pair.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type * as ReactTypes from 'react';

const require = createRequire(import.meta.url);
const umd = path.join(path.dirname(require.resolve('react18/package.json')), 'umd/react.development.js');

const cjsModule = { exports: {} as typeof ReactTypes };
new Function('exports', 'module', 'require', readFileSync(umd, 'utf8'))(cjsModule.exports, cjsModule, (id: string) => {
  throw new Error(`react 18 asked for ${id}`);
});

const React = cjsModule.exports;

export default React;
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cloneElement,
  createContext,
  createElement,
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
} = React;
const internals = React as unknown as Record<string, unknown>;
export const createFactory = internals.createFactory;
export const unstable_act = internals.unstable_act;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = internals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
