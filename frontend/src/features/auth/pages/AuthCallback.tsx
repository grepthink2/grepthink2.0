/**
 * OAuth callback handler for the PKCE flow.
 *
 * Supabase's Google sign-in redirects here with a `?code=...` query
 * parameter. We exchange that code for a session, then route the user:
 *
 *   - to /select (role selection) if this is their first login and no
 *     profile row exists yet.
 *   - to /app/home if they already have a profile.
 *   - back to /login with an error message on any failure.
 *
 * Profile existence is checked via `api.loginCheck()` so the decision
 * is authoritative (backend RLS-independent).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/api';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<string>('Completing sign-in...');

  React.useEffect(() => {
    let cancelled = false;

    const redirectToLogin = (reason: string) => {
      if (cancelled) return;
      setStatus('Sign-in failed. Redirecting...');
      navigate('/login?error=' + encodeURIComponent(reason), { replace: true });
    };

    const run = async () => {
      // Surface explicit OAuth errors from the provider first.
      const url = new URL(window.location.href);
      const oauthError =
        url.searchParams.get('error_description') || url.searchParams.get('error');
      if (oauthError) {
        redirectToLogin(oauthError);
        return;
      }

      // Exchange the ?code=... for a session. Supabase reads the URL
      // itself and pairs it with the PKCE verifier kept in localStorage.
      const { data: exchangeData, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(window.location.href);

      if (exchangeError || !exchangeData.session) {
        // eslint-disable-next-line no-console
        console.error('[AuthCallback] code exchange failed:', exchangeError);
        redirectToLogin(exchangeError?.message ?? 'Session exchange failed');
        return;
      }

      // Ask the backend whether a profile row already exists.
      // api.loginCheck() returns { user_id, role } where role is null
      // when no profiles row is present for this user.
      try {
        const me = await api.loginCheck();
        if (cancelled) return;

        if (!me.role) {
          navigate('/select', { replace: true });
          return;
        }

        navigate('/app/home', { replace: true });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AuthCallback] loginCheck failed:', err);
        // Signed in but can't reach the backend — send them to the app
        // anyway; Home.tsx will surface the backend status.
        navigate('/app/home', { replace: true });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      {status}
    </div>
  );
};

export default AuthCallback;
