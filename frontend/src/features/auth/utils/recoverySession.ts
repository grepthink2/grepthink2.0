import { supabase } from '@/lib/supabaseClient';

/** True when a PKCE code verifier is present in browser storage. */
function hasPkceCodeVerifier(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('code-verifier')) {
        const value = localStorage.getItem(key);
        if (value) return true;
      }
    }
  } catch {
    // localStorage unavailable
  }
  return false;
}

/**
 * Establish a password-recovery session from URL params.
 *
 * Prefer token_hash (works cross-browser). PKCE ?code= only works when the
 * verifier was stored in this browser when resetPasswordForEmail was called.
 */
export async function establishRecoverySession(): Promise<{ ok: boolean; error?: string }> {
  const url = new URL(window.location.href);

  const oauthError =
    url.searchParams.get('error_description') || url.searchParams.get('error');
  if (oauthError) {
    return { ok: false, error: oauthError };
  }

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    window.history.replaceState({}, document.title, '/reset-password');
    return { ok: true };
  }

  // Implicit / hash-fragment links (#access_token=…&type=recovery)
  if (url.hash.includes('access_token') || url.hash.includes('type=recovery')) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      window.history.replaceState({}, document.title, '/reset-password');
      return { ok: true };
    }
  }

  const code = url.searchParams.get('code');
  if (code) {
    if (!hasPkceCodeVerifier()) {
      return {
        ok: false,
        error:
          'This reset link must be opened in the same browser where you requested it, ' +
          'or you need a new reset email. If the problem persists, ask your admin to ' +
          'update the Supabase "Reset password" email template to use token_hash links.',
      };
    }
    const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
    if (error) {
      return { ok: false, error: error.message };
    }
    window.history.replaceState({}, document.title, '/reset-password');
    return { ok: true };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return { ok: true };
  }

  return { ok: false };
}
