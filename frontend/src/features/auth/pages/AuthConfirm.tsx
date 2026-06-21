/**
 * Handles Supabase email links that carry token_hash (password recovery,
 * email confirmation). Uses verifyOtp so the flow works when the user opens
 * the link in a different browser or device — unlike PKCE ?code= exchange.
 */
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import './AuthConfirm.scss';

const AuthConfirm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = React.useState('Confirming your link…');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    // Supabase Site URL may include /auth/confirm, producing a doubled path in
    // the email link. Normalise so query params stay but the path is clean.
    if (window.location.pathname !== '/auth/confirm') {
      window.history.replaceState(
        {},
        document.title,
        `/auth/confirm${window.location.search}${window.location.hash}`,
      );
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const confirm = async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') as EmailOtpType | null;
      const next = searchParams.get('next') || '/reset-password';

      if (!tokenHash || !type) {
        if (!cancelled) {
          setError('Invalid or expired confirmation link.');
          setStatus('');
        }
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (cancelled) return;

      if (verifyError) {
        setError(verifyError.message);
        setStatus('');
        return;
      }

      setStatus('Success! Redirecting…');
      const destination = next.startsWith('/') ? next : `/${next}`;
      navigate(destination, { replace: true });
    };

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="authConfirm">
        <div className="authConfirm__card">
          <h1 className="authConfirm__title">Almost there</h1>
          {status && <p className="authConfirm__status">{status}</p>}
          {error && (
            <>
              <p className="authConfirm__error" role="alert">
                {error}
              </p>
              <button
                type="button"
                className="authConfirm__button"
                onClick={() => navigate('/forgot-password')}
              >
                Request a new reset link
              </button>
              <button
                type="button"
                className="authConfirm__link"
                onClick={() => navigate('/login')}
              >
                Back to login
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default AuthConfirm;
