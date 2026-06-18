/**
 * OAuth callback handler for the PKCE flow.
 *
 * With detectSessionInUrl enabled (the default), the Supabase SDK
 * automatically detects the ?code= parameter on this page and exchanges
 * it for a session — using the PKCE verifier it stored in localStorage
 * when signInWithOAuth was called. We listen for the resulting SIGNED_IN
 * event and then route the user:
 *
 *   - to /select (role selection) if this is their first login and no
 *     profile row exists yet.
 *   - to /app/home if they already have a profile.
 *   - back to /login with an error message on any failure.
 *
 * We also check getSession() immediately on mount in case the SDK already
 * finished the exchange synchronously (e.g. the user refreshed the page).
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

    // Surface explicit OAuth errors forwarded in the URL.
    const url = new URL(window.location.href);
    const oauthError =
      url.searchParams.get('error_description') || url.searchParams.get('error');
    if (oauthError) {
      redirectToLogin(oauthError);
      return;
    }

    // 'source' is set by whichever page initiated the OAuth flow:
    //   source=signup  → new users are allowed and routed to /select
    //   source=login   → new users are rejected with a friendly error
    const source = url.searchParams.get('source');

    const routeUser = async (_accessToken: string) => {
      if (cancelled) return;
      try {
        const me = await api.loginCheck();
        if (cancelled) return;

        if (!me.role) {
          // No profile row → this is a brand-new Google account.
          if (source === 'login') {
            // Reject: they must sign up first and choose a role.
            redirectToLogin(
              'No account found for this Google address. Please sign up first and choose a role.',
            );
          } else {
            // signup flow (or unknown source) → let them pick a role.
            navigate('/select', { replace: true });
          }
          return;
        }

        navigate('/app/home', { replace: true });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AuthCallback] loginCheck failed:', err);
        // Signed in but backend unreachable — send them to the app
        // anyway; Home.tsx will surface the backend status.
        if (!cancelled) navigate('/app/home', { replace: true });
      }
    };

    // Listen for the SIGNED_IN event the SDK fires after it auto-exchanges
    // the ?code= parameter on this page.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        if (event === 'SIGNED_IN' && session) {
          subscription.unsubscribe();
          routeUser(session.access_token);
        }
      },
    );

    // Fallback: if the SDK already exchanged the code synchronously before
    // our listener registered (or the user refreshed), pick up the session
    // from getSession() directly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;
      subscription.unsubscribe();
      routeUser(session.access_token);
    });

    // Safety net: redirect to login if nothing resolves within 15 s.
    const timeout = setTimeout(() => {
      if (!cancelled) {
        redirectToLogin('Sign-in timed out. Please try again.');
      }
    }, 15000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
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
