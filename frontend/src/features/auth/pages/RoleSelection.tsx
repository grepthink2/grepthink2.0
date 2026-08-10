/**
 * RoleSelection (a.k.a. `/select`) serves two audiences:
 *
 * 1. New users who are NOT authenticated yet. Clicking a role routes them
 *    to the matching email/password signup form.
 * 2. Users who just finished Google OAuth and don't yet have a profiles row
 *    (AuthCallback sends them here when `api.loginCheck()` returns
 *    `role: null`). Clicking a role calls `/api/create-user` to provision
 *    the row and drops them on `/app/home`.
 *
 * The single page handles both flows so the OAuth callback doesn't need a
 * separate "pick role" screen.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Presentation, GraduationCap } from 'lucide-react';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import arrowIcon from '@assets/Arrow.svg?url';
import { useUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './RoleSelection.scss';

type Role = 'instructor' | 'student';

const RoleSelection: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [isChecking, setIsChecking] = React.useState(false);

  // If an authenticated user already has a profile row, don't let them sit
  // on the role picker — send them to the app. This guards against users
  // manually navigating to /select after signup and handles the race where
  // onAuthStateChange fires before AuthCallback finishes routing.
  React.useEffect(() => {
    if (!isLoaded || !user) return;
    let cancelled = false;
    setIsChecking(true);
    (async () => {
      try {
        const me = await api.loginCheck();
        if (cancelled) return;
        if (me.role) {
          navigate('/app/home', { replace: true });
        }
      } catch (err) {
        // A backend outage shouldn't strand the user on a blank page — let
        // them still pick a role manually. The createUser call below will
        // surface any real backend problem with a readable error.
        console.warn('[RoleSelection] loginCheck failed:', err);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, navigate]);

  const handleRoleClick = async (role: Role) => {
    setError('');

    // Unauthenticated: fall through to the email/password signup flow.
    if (!user) {
      navigate(role === 'instructor' ? '/instructorsignup' : '/studentsignup');
      return;
    }

    // Authenticated but no profile row yet — the OAuth first-login case.
    // Provision the profiles row with the chosen role and drop the user on
    // the app home. No email/password step, since Supabase already has an
    // identity for this user via Google.
    if (!user.email) {
      setError('We could not read your email from your Google account. Please sign out and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const meta = user.user_metadata ?? {};
      await api.createUser({
        userId: user.id,
        email: user.email,
        userType: role,
        firstName: meta.given_name || meta.first_name || undefined,
        lastName: meta.family_name || meta.last_name || undefined,
        avatarUrl: meta.avatar_url || meta.picture || undefined,
      });
      navigate('/app/home', { replace: true });
    } catch (err) {
      console.error('[RoleSelection] createUser failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to finish sign-up. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  // Avoid flashing the buttons with the wrong behavior before we know
  // whether the user has a session (or whether they already have a role).
  if (!isLoaded || isChecking) {
    return (
      <>
        <GradientBackgroundWrapper />
        <div className="pageWrapper">
          <div className="container" aria-busy="true">
            <Skeleton width={180} height={16} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          <h1 className="header">{user ? 'Finish Creating Your Account' : 'Create an Account'}</h1>
          <p className="subtext">
            {user ? 'Pick a role to continue' : 'Just a few details to get started'}
          </p>

          {error && <div className="error">{error}</div>}

          {/* Instructor Signup Button */}
          <button
            className="button-rectangle"
            onClick={() => handleRoleClick('instructor')}
            disabled={isSubmitting}
          >
            <Presentation size={22} strokeWidth={2} />
            {user ? 'Continue as Instructor' : 'Sign Up as Instructor'}
          </button>

          {/* Student Signup Button */}
          <button
            className="button-rectangle"
            onClick={() => handleRoleClick('student')}
            disabled={isSubmitting}
          >
            <GraduationCap size={22} strokeWidth={2} />
            {user ? 'Continue as Student' : 'Sign Up as Student'}
          </button>

          {/* Only show the login link for unauthenticated visitors. */}
          {!user && (
            <>
              <div className="divider">
                <div className="divider-line"></div>
                <div className="divider-text">Or</div>
                <div className="divider-line"></div>
              </div>

              <div className="login-section">
                <span className="login-text">Already have an account?</span>
                <div className="login-link" onClick={handleLogin}>
                  Login
                  <img src={arrowIcon} alt="arrow" className="arrow-icon" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default RoleSelection;
