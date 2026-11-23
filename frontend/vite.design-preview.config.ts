/**
 * One design-system preview (`npm run design:build`, through scripts/design-system/previews.mjs and
 * preview-runner.mjs): the generated entry named by DESIGN_PREVIEW_ENTRY, which mounts a kit
 * component's `<Folder>.preview.tsx`, as a classic script for the preview's page.
 *
 * - An IIFE library build, not minified, to .design-system/raw/previews/<DESIGN_PREVIEW_NAME>.js.
 * - React stays the page's, as in the bundle (vite.design.config.ts): `react` is
 *   design-system/runtime/react.ts over `window.React`, `react-dom` and `react-dom/client` are
 *   `window.ReactDOM`, and the JSX runtime is the ref adapter's.
 * - The kit is the published bundle: an import that resolves to a kit module under src/components/
 *   (or to Icon) becomes a module reading the same names from `window.GrepThinkDesignSystem_36e7e3`,
 *   so the preview carries none of the kit's source (a module's default export, MarkdownText's, is
 *   its namespace name). A name the namespace does not hold for that module fails the build, naming
 *   it.
 * - lucide-react is bundled in: a preview's icons are its own.
 *
 * The app's build (vite.config.ts) does not read this file.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import appConfig from './vite.config';
import { react18 } from './design-system/react18-plugin';

const app = appConfig({ mode: 'production', command: 'build' });
const here = (file: string) => path.resolve(__dirname, file);

type KitModule = { names: string[]; default?: string };
type KitIndex = { namespace: string; componentsDir: string; modules: Record<string, KitModule> };

const KIT_PREFIX = '\0design-system-kit:';
const withoutExtension = (file: string) => file.replace(/\.tsx?$/, '');

/** Kit modules read from the bundle's namespace instead of compiled in. */
function kitFromNamespace(index: KitIndex): Plugin {
  const kitDir = index.componentsDir + path.sep;
  return {
    name: 'grepthink-design-system:kit-from-namespace',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0') || !/^(?:\.|\/|@\/|@components\/)/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return null;
      const file = resolved.id.split('?')[0];
      if (file.endsWith('.preview.tsx')) return null;
      const key = withoutExtension(file);
      if (key in index.modules || file.startsWith(kitDir)) return KIT_PREFIX + key;
      return null;
    },
    load(id) {
      if (!id.startsWith(KIT_PREFIX)) return null;
      const module = index.modules[id.slice(KIT_PREFIX.length)] ?? { names: [] };
      return {
        moduleType: 'js',
        code: [
          `const kit = window.${index.namespace};`,
          `if (!kit) throw new Error('window.${index.namespace} is missing: the design system bundle runs before a preview');`,
          ...module.names.map((name) => `export const ${name} = kit.${name};`),
          ...(module.default ? [`export default kit.${module.default};`] : []),
          '',
        ].join('\n'),
      };
    },
  };
}

export default defineConfig((): UserConfig => {
  const entry = process.env.DESIGN_PREVIEW_ENTRY;
  const name = process.env.DESIGN_PREVIEW_NAME;
  if (!entry || !name) throw new Error('vite.design-preview.config.ts builds the preview named by DESIGN_PREVIEW_ENTRY and DESIGN_PREVIEW_NAME');
  const index = JSON.parse(readFileSync(here('.design-system/gen/previews/kit.json'), 'utf8')) as KitIndex;
  return {
    root: __dirname,
    publicDir: false,
    logLevel: 'warn',
    plugins: [kitFromNamespace(index), react18(), react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    resolve: {
      alias: [
        { find: /^react\/jsx(-dev)?-runtime$/, replacement: here('design-system/runtime/jsx-runtime.ts') },
        ...Object.entries(app.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement })),
      ],
    },
    build: {
      outDir: here('.design-system/raw/previews'),
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      copyPublicDir: false,
      lib: {
        entry,
        formats: ['iife'],
        name: 'GrepThinkDesignSystemPreview',
        fileName: () => `${name}.js`,
      },
      rolldownOptions: {
        external: ['react-dom', 'react-dom/client'],
        output: {
          globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
        },
      },
    },
  };
});
