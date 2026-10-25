/**
 * The consent page Supabase's OAuth server sends a connected app's sign-in to
 * (`/oauth/consent?authorization_id=...`): an AI assistant such as Claude or ChatGPT asks to act
 * for the student on their scrum boards (the MCP connector, backend `app/mcp`). A signed-out
 * visitor logs in first and comes back here; the answer goes to Supabase, which sends the browser
 * back to the app.
 */
import React from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Alert } from '@components/Alert/Alert';
import { Button } from '@components/Button/Button';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import { useAuth } from '@/lib/auth';
import { leaveSiteTo } from '@/lib/leaveSite';
import { rememberReturnTo } from '@/lib/returnTo';
import { supabase } from '@/lib/supabaseClient';
import './OAuthConsent.scss';

const INCOMPLETE = "This sign-in link isn't complete. Start connecting again from your AI assistant.";
const EXPIRED = 'This request has expired or was already used. Start connecting again from your AI assistant.';
const ANSWER_FAILED = "We couldn't send your answer. Try again.";

interface Request {
  appName: string;
  email: string;
}

const ConsentCard: React.FC<{ authorizationId: string }> = ({ authorizationId }) => {
  const [request, setRequest] = React.useState<Request | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [answering, setAnswering] = React.useState<'allow' | 'deny' | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(
      ({ data, error: lookupError }) => {
        if (cancelled) return;
        if (lookupError || !data) {
          setError(EXPIRED);
        } else if ('redirect_url' in data) {
          // Consented before: Supabase answers with the way back to the app.
          leaveSiteTo(data.redirect_url);
        } else {
          setRequest({ appName: data.client.name || 'An app', email: data.user.email });
        }
      },
      () => {
        if (!cancelled) setError(EXPIRED);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  // Approve and deny redirect the browser themselves; only a failure comes back here.
  const answer = async (choice: 'allow' | 'deny') => {
    setAnswering(choice);
    setError(null);
    const { error: answerError } =
      choice === 'allow'
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (answerError) {
      setError(ANSWER_FAILED);
      setAnswering(null);
    }
  };

  if (!request) {
    return error ? <Alert tone="error">{error}</Alert> : <p className="oauth-consent__text">Checking the request…</p>;
  }
  return (
    <>
      <h1 className="oauth-consent__title">Connect {request.appName} to GrepThink?</h1>
      <p className="oauth-consent__text">
        {request.appName} will be able to read your teams' scrum boards and add items to them, as you. It can't
        change or delete anything already there.
      </p>
      <p className="oauth-consent__account">
        Signed in as <strong>{request.email}</strong>
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="oauth-consent__actions">
        <Button variant="outline" onClick={() => answer('deny')} disabled={answering !== null} loading={answering === 'deny'}>
          Deny
        </Button>
        <Button variant="primary" onClick={() => answer('allow')} disabled={answering !== null} loading={answering === 'allow'}>
          Allow
        </Button>
      </div>
    </>
  );
};

const OAuthConsent: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user, loading } = useAuth();
  const authorizationId = searchParams.get('authorization_id');
  const here = location.pathname + location.search;

  if (authorizationId && !loading && !user) {
    // Google sign-in leaves the site and comes back through /auth/callback, which reads this.
    rememberReturnTo(here);
    return <Navigate to="/login" replace state={{ from: here }} />;
  }

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="oauth-consent">
        <div className="oauth-consent__card">
          {!authorizationId ? (
            <Alert tone="error">{INCOMPLETE}</Alert>
          ) : loading ? (
            <p className="oauth-consent__text">Checking your sign-in…</p>
          ) : (
            <ConsentCard key={authorizationId} authorizationId={authorizationId} />
          )}
        </div>
      </div>
    </>
  );
};

export default OAuthConsent;
