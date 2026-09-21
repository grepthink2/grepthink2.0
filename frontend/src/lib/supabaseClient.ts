import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from './supabaseEnv';

/**
 * Supabase client for GrepThink 2.0.
 *
 * Auth storage: browser localStorage (Supabase default, ~5MB limit).
 * Auth flow:    PKCE. OAuth authorization codes are exchanged for a
 *               session on our /auth/callback route, keeping the
 *               refresh token out of the URL.
 *
 * History: an earlier version used a custom cookieStorage adapter that
 * stored every Supabase key under a single __Host-session cookie. It
 * had two unfixable bugs — sessions >4KB were silently dropped, and
 * the `__Host-`/`Secure` combo is inconsistently honored on
 * http://localhost — so it was removed. If/when we adopt a proper
 * backend-for-frontend pattern we'll reintroduce cookie-based storage
 * via HttpOnly server-set cookies. See AUTH.md for background.
 */
// Only VITE_-prefixed variables reach the bundle (see vite.config.ts envPrefix).
const { url: supabaseUrl, anonKey: supabaseAnonKey, missing } = resolveSupabaseEnv(import.meta.env);

if (missing.length > 0) {
  console.error(
    `Missing Supabase configuration. Set ${missing.join(' and ')} in the repo-root .env.`,
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // detectSessionInUrl defaults to true — the SDK will detect the
    // ?code= in the URL on /auth/callback and exchange it automatically,
    // keeping the PKCE verifier lookup on the same origin where it was
    // stored. AuthCallback.tsx listens for the resulting SIGNED_IN event
    // rather than calling exchangeCodeForSession manually.
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
