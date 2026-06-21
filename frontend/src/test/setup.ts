/**
 * Global test setup — runs once before every test file (see `test.setupFiles`
 * in vite.config.ts).
 *
 * - Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
 * - Cleans up the rendered DOM between tests so component tests stay isolated.
 * - Stubs the Supabase env vars so importing `lib/supabaseClient.ts` (which many
 *   components pull in transitively) doesn't throw during tests.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Provide harmless Supabase env values for any module that reads them at import.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_KEY', 'test-anon-key');

afterEach(() => {
  cleanup();
});
