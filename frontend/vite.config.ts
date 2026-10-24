import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const apiTarget =
    mode === 'prod'
      ? 'https://api.grepthink2.com'
      : 'http://localhost:5001';
  const { version } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

  return {
    plugins: [react()],
    envDir: '..', // Point to the root directory for .env file
    // Only VITE_* reaches the browser bundle. The root .env also holds the
    // backend's SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET; adding a
    // 'SUPABASE_' prefix here would inline them into the client JS.
    envPrefix: ['VITE_'],
    // The release this build is, from package.json; the app reads it as APP_VERSION
    // (src/features/releases/version.ts). Vitest uses this config, so tests see the same value.
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@assets': path.resolve(__dirname, './src/assets'),
        '@components': path.resolve(__dirname, './src/components'),
        '@features': path.resolve(__dirname, './src/features'),
        '@styles': path.resolve(__dirname, './src/styles'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Vendor code changes far less often than app code; separate chunks
          // stay cached in browsers across deploys.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
              },
              { name: 'supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      host: true, // Listen on all addresses (LAN) so other devices can connect over wifi
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      // Component tests need a browser-like DOM; jsdom is enough for Testing Library.
      environment: 'jsdom',
      // One jsdom per worker and a fresh window per file, instead of a process per file: the
      // suite runs about three times faster (39 s → 13 s here; 48 s → 27 s with coverage).
      // The sandbox has two consequences: objects made by Node APIs or jsdom internals live in
      // another realm, so toStrictEqual and instanceof can disagree where toEqual passes; and
      // memory is reclaimed by recycling a worker past the limit below, not by GC. `isolate`
      // has no effect in this pool.
      pool: 'vmThreads',
      vmMemoryLimit: '2GB',
      // Expose describe/it/expect/vi globally (Jest-like, no per-file imports).
      globals: true,
      // jest-dom matchers + shared mocks; runs before every test file.
      setupFiles: ['./src/test/setup.ts'],
      // The app uses SCSS; let Vitest process style imports so components render.
      css: true,
      coverage: {
        provider: 'v8',
        // Every source file counts, not only the ones a test happens to import.
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/**/__tests__/**',
          'src/test/**',
          'src/**/*.d.ts',
          'src/main.tsx',
        ],
        // text-summary for the terminal, html to browse locally, lcov for Codecov,
        // json-summary for the CI job summary.
        reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
        // 54% lines, 50% branches on 2026-10-16. Raise these as coverage grows; never
        // lower them to get a build through.
        thresholds: {
          lines: 52,
          statements: 52,
          branches: 48,
          functions: 48,
          // The shared components (all of src/components/ together) keep their own floor, which
          // only goes up too.
          'src/components/**': { lines: 90, statements: 90, branches: 85, functions: 85 },
        },
      },
    },
  };
})
