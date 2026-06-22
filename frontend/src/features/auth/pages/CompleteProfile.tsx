/**
 * Standalone profile-completion step (`/complete-profile`).
 *
 * When email confirmation is enabled, signup is split across two page loads:
 * the email/password step, then the confirmation-link click. The in-orchestrator
 * name step (AccountDetails) never runs, so AuthCallback sends users whose
 * profile has no name here to collect it (and a roster .edu email for students)
 * before dropping them in the app.
 *
 * The profile row itself already exists — Supabase's handle_new_user trigger
 * creates it at signup with the role from user_metadata — so AccountDetails
 * only needs to PATCH the name/edu fields.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { apiRequest, type ApiProfile } from '@/lib/api';
import AccountDetails from './AccountDetails';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';

const CompleteProfile: React.FC = () => {
  const navigate = useNavigate();
  const [details, setDetails] = React.useState<{
    email: string;
    userType: 'instructor' | 'student';
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const profile = await apiRequest<ApiProfile>('/api/profiles/me');
        if (cancelled) return;
        // Already named — nothing to complete; send them into the app.
        if (profile.first_name?.trim() && profile.last_name?.trim()) {
          navigate('/app/home', { replace: true });
          return;
        }
        setDetails({
          email: session.user.email || profile.email || '',
          userType: profile.role === 'instructor' ? 'instructor' : 'student',
        });
      } catch {
        // Backend unreachable — let them into the app; the complete-profile
        // notification will still prompt them to fill in their details.
        if (!cancelled) navigate('/app/home', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!details) {
    return (
      <>
        <GradientBackgroundWrapper />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
          }}
        >
          Loading…
        </div>
      </>
    );
  }

  return (
    <>
      <GradientBackgroundWrapper />
      <AccountDetails email={details.email} userType={details.userType} />
    </>
  );
};

export default CompleteProfile;
