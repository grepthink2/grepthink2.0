import { describe, expect, it } from 'vitest';
import { resolveSupabaseEnv } from '../supabaseEnv';

describe('resolveSupabaseEnv', () => {
  it('reads the VITE_-prefixed names the client is allowed to see', () => {
    expect(
      resolveSupabaseEnv({
        VITE_SUPABASE_URL: 'https://proj.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      }),
    ).toEqual({ url: 'https://proj.supabase.co', anonKey: 'anon-key', missing: [] });
  });

  it('accepts the legacy VITE_SUPABASE_KEY name for the anon key', () => {
    const r = resolveSupabaseEnv({
      VITE_SUPABASE_URL: 'https://proj.supabase.co',
      VITE_SUPABASE_KEY: 'legacy-anon',
    });
    expect(r.anonKey).toBe('legacy-anon');
    expect(r.missing).toEqual([]);
  });

  it('never reads backend-only names, even when present in the env', () => {
    // Regression guard: the old client fell back to SUPABASE_URL / SUPABASE_KEY,
    // which only worked because vite.config.ts exposed every SUPABASE_* variable
    // to the bundle - including the service-role key and the JWT secret.
    const r = resolveSupabaseEnv({
      SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SUPABASE_JWT_SECRET: 'secret',
    });
    expect(r.url).toBe('');
    expect(r.anonKey).toBe('');
    expect(r.missing).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
  });

  it('reports which names are missing so the console error is actionable', () => {
    expect(resolveSupabaseEnv({ VITE_SUPABASE_URL: 'u' }).missing).toEqual(['VITE_SUPABASE_ANON_KEY']);
    expect(resolveSupabaseEnv({ VITE_SUPABASE_ANON_KEY: 'k' }).missing).toEqual(['VITE_SUPABASE_URL']);
  });
});
