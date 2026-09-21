/**
 * Resolve the Supabase connection settings the browser is allowed to know.
 *
 * Only `VITE_`-prefixed variables are read. The old client also fell back to
 * `SUPABASE_URL` / `SUPABASE_KEY`, which only worked because vite.config.ts
 * exposed *every* `SUPABASE_*` variable to the bundle — including the
 * service-role key and the JWT secret from the repo-root `.env`. Keeping the
 * lookup here (pure, testable) is what guards against that coming back.
 */
export interface SupabaseEnv {
  url: string;
  anonKey: string;
  /** Names that were expected but absent — surfaced in the console error. */
  missing: string[];
}

type EnvLike = Record<string, string | boolean | undefined>;

function str(value: string | boolean | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveSupabaseEnv(env: EnvLike): SupabaseEnv {
  const url = str(env.VITE_SUPABASE_URL);
  // VITE_SUPABASE_KEY is the legacy name still used by some local .env files.
  const anonKey = str(env.VITE_SUPABASE_ANON_KEY) || str(env.VITE_SUPABASE_KEY);
  const missing: string[] = [];
  if (!url) missing.push('VITE_SUPABASE_URL');
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  return { url, anonKey, missing };
}
