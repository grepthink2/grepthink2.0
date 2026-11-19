import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Where `react` resolves in the design-system build and its tests.
 *
 * Every `react` import (the kit's, and those of the libraries bundled with it) gets
 * `runtime/react.ts`, which re-exports React and adds what React 18 lacks. That module's own
 * `react` import gets the real React 18: with no argument, the page's `window.React` (the bundle
 * leaves it external); otherwise the module named (the tests' React 18, test/react.ts).
 */
export const REACT_SHIM = path.resolve(__dirname, 'runtime/react.ts');

export function react18(realReact?: string): Plugin {
  return {
    name: 'grepthink-design-system:react18',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source !== 'react') return null;
      if (importer !== REACT_SHIM) return REACT_SHIM;
      return realReact ?? { id: 'react', external: true };
    },
  };
}
