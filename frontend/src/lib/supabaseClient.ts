import { createClient } from '@supabase/supabase-js';

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
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL;

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_KEY ||
  import.meta.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_KEY) in your .env.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The PKCE code exchange is handled explicitly in /auth/callback so
    // we can show a loading state and route the user based on whether
    // a profile exists. Disable the SDK's opportunistic URL scan so it
    // doesn't try to handle the same ?code=... parameter twice.
    detectSessionInUrl: false,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
