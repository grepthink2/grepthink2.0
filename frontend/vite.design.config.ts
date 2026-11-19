/**
 * The design-system bundle (`npm run design:build`, through scripts/design-system/bundle.mjs): the
 * shared kit as one classic script for a page that already has React 18, and its stylesheet.
 *
 * - Library build of the generated entry (.design-system/gen/entry.ts), an IIFE that assigns
 *   `window.GrepThinkDesignSystem_36e7e3`; minified, production React paths.
 * - React stays the page's: `react` is design-system/runtime/react.ts over `window.React`
 *   (react18-plugin.ts), and `react-dom` is `window.ReactDOM`.
 * - The JSX runtime is the ref adapter's, `react-router-dom` is the Link stand-in, and `Icon`
 *   reads the generated icon list.
 * - Output goes to .design-system/raw/ (bundle.js and bundle.css), which bundle.mjs finishes.
 *
 * The app's build (vite.config.ts) does not read this file.
 */
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import appConfig from './vite.config';
import { react18 } from './design-system/react18-plugin';

const app = appConfig({ mode: 'production', command: 'build' });
const here = (file: string) => path.resolve(__dirname, file);

export default defineConfig({
  root: __dirname,
  publicDir: false,
  logLevel: 'warn',
  plugins: [react18(), react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: [
      { find: /^react\/jsx(-dev)?-runtime$/, replacement: here('design-system/runtime/jsx-runtime.ts') },
      { find: /^react-router-dom$/, replacement: here('design-system/runtime/router-stub.tsx') },
      { find: /^virtual:design-system-icons$/, replacement: here('.design-system/gen/icons.ts') },
      ...Object.entries(app.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  build: {
    outDir: here('.design-system/raw'),
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    cssCodeSplit: false,
    copyPublicDir: false,
    lib: {
      entry: here('.design-system/gen/entry.ts'),
      formats: ['iife'],
      name: 'GrepThinkDesignSystemBuild',
      fileName: () => 'bundle.js',
      cssFileName: 'bundle',
    },
    rolldownOptions: {
      external: ['react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
});
