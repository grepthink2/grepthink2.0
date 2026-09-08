import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const apiTarget =
    mode === 'prod'
      ? 'https://api.grepthink2.com'
      : 'http://localhost:5001';

  return {
    plugins: [react()],
    envDir: '..', // Point to the root directory for .env file
    // Only VITE_* reaches the browser bundle. The root .env also holds the
    // backend's SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET; adding a
    // 'SUPABASE_' prefix here would inline them into the client JS.
    envPrefix: ['VITE_'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@assets': path.resolve(__dirname, './src/assets'),
        '@components': path.resolve(__dirname, './src/components'),
        '@features': path.resolve(__dirname, './src/features'),
        '@pages': path.resolve(__dirname, './src/pages'),
        '@styles': path.resolve(__dirname, './src/styles'),
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
      // Expose describe/it/expect/vi globally (Jest-like, no per-file imports).
      globals: true,
      // jest-dom matchers + shared mocks; runs before every test file.
      setupFiles: ['./src/test/setup.ts'],
      // The app uses SCSS; let Vitest process style imports so components render.
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  };
})
