/**
 * React DOM 18 for `npm run design:test`, on the same React 18 the kit gets.
 *
 * The `react-dom18` package cannot be loaded as it is: its CommonJS files `require('react')` and
 * `require('react-dom')`, which Node resolves to the app's React 19 packages, since an npm alias
 * keeps the original package name inside. Its UMD build takes React as an argument instead, so it
 * is evaluated here with React 18's UMD build (react.ts) handed in: the pair a page loads, in their
 * development form.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import React18 from './react';

const require = createRequire(import.meta.url);
const umd = path.join(path.dirname(require.resolve('react-dom18/package.json')), 'umd/react-dom.development.js');

type ReactDOM18 = typeof import('react-dom') & typeof import('react-dom/client');

const cjsModule = { exports: {} as ReactDOM18 };
const load = new Function('exports', 'module', 'require', readFileSync(umd, 'utf8'));
load(cjsModule.exports, cjsModule, (id: string) => {
  if (id === 'react') return React18;
  throw new Error(`react-dom 18 asked for ${id}`);
});

const ReactDOM = cjsModule.exports;

export default ReactDOM;
export const {
  createPortal,
  createRoot,
  findDOMNode,
  flushSync,
  hydrate,
  hydrateRoot,
  render,
  unmountComponentAtNode,
  unstable_batchedUpdates,
  unstable_renderSubtreeIntoContainer,
  version,
} = ReactDOM as unknown as Record<string, never>;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = (ReactDOM as unknown as Record<string, unknown>)
  .__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
