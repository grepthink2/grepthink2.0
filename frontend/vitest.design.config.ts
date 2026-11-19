/**
 * `npm run design:test`: the shared kit's own tests, and the design-system runtime's, on React 18
 * resolved as the design-system build resolves it (vite.design.config.ts):
 *   - `react` is design-system/runtime/react.ts over React 18 (react18-plugin.ts), loaded with
 *     React DOM 18 from their UMD builds (design-system/test/react.ts and react-dom.ts say why);
 *   - the JSX runtime is the ref adapter's (design-system/runtime/jsx-runtime.ts).
 * `react-router-dom` stays the real package here: the kit's tests render it in a MemoryRouter.
 * Libraries that import React are processed by Vite (`server.deps.inline`), from their ES module
 * builds (`module`), so their `react` and `react-dom` imports resolve the same way; Node, or their
 * CommonJS builds, would hand them the app's React 19.
 *
 * A kit test that cannot pass on React 18 for a reason the adapter does not cause is listed, with
 * its reason, in design-system/react18-skips.json; its file is left out here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import appConfig from './vite.config';
import { react18 } from './design-system/react18-plugin';

type Skip = { file: string; test: string; reason: string };

const skips = JSON.parse(readFileSync(path.resolve(__dirname, 'design-system/react18-skips.json'), 'utf8')) as Skip[];
const app = appConfig({ mode: 'test', command: 'serve' });
const appTest = app.test ?? {};
const runtime = (file: string) => path.resolve(__dirname, 'design-system', file);

export default defineConfig({
  plugins: [react18(runtime('test/react.ts')), react()],
  define: app.define,
  resolve: {
    mainFields: ['module'],
    conditions: ['module', 'module-sync'],
    alias: [
      { find: /^react\/jsx(-dev)?-runtime$/, replacement: runtime('runtime/jsx-runtime.ts') },
      { find: /^react-dom$/, replacement: runtime('test/react-dom.ts') },
      { find: /^react-dom\/client$/, replacement: runtime('test/react-dom-client.ts') },
      { find: /^react-dom\/test-utils$/, replacement: runtime('test/react-dom-test-utils.ts') },
      ...Object.entries(app.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  test: {
    environment: appTest.environment,
    pool: appTest.pool,
    vmMemoryLimit: appTest.vmMemoryLimit,
    globals: appTest.globals,
    setupFiles: appTest.setupFiles,
    css: appTest.css,
    include: ['src/components/**/*.test.{ts,tsx}', 'design-system/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, ...skips.map((skip) => skip.file)],
    server: {
      deps: {
        inline: [/[\\/]node_modules[\\/](@testing-library[\\/]react|react-router|react-router-dom|lucide-react|react-markdown)[\\/]/],
      },
    },
  },
});
