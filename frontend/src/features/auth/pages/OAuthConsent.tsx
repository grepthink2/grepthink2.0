/**
 * The consent page for the scrum board MCP connector (`/oauth/consent?request=...`). An AI assistant
 * such as Claude or ChatGPT asks to act for the student on their scrum boards; the backend's
 * authorization server (`app/mcp/oauth.py`) sends the browser here. A signed-out visitor logs in
 * first and comes back. The answer goes to the backend, which says where the browser goes next:
 * back to the app, with a one-time code or with a refusal.
 */
import React from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Alert } from '@components/Alert/Alert';
import { Button } from '@components/Button/Button';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import { api, type ApiMcpAuthorization } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leaveSiteTo } from '@/lib/leaveSite';
import { rememberReturnTo, takeReturnTo } from '@/lib/returnTo';
import './OAuthConsent.scss';

const INCOMPLETE = "This sign-in link isn't complete. Start connecting again from your AI assistant.";
const EXPIRED = 'This request has expired or was already used. Start connecting again from your AI assistant.';
const ANSWER_FAILED = "We couldn't send your answer. Try again.";

const ConsentCard: React.FC<{ requestId: string; email: string | undefined }> = ({ requestId, email }) => {
  const [request, setRequest] = React.useState<ApiMcpAuthorization | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [answering, setAnswering] = React.useState<'allow' | 'deny' | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api.getMcpAuthorization(requestId).then(
      (details) => {
        if (!cancelled) setRequest(details);
      },
      () => {
        if (!cancelled) setError(EXPIRED);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const answer = async (choice: 'allow' | 'deny') => {
    setAnswering(choice);
    setError(null);
    try {
      const { redirect_url } = await api.answerMcpAuthorization(requestId, choice === 'allow');
      leaveSiteTo(redirect_url);
    } catch {
      setError(ANSWER_FAILED);
      setAnswering(null);
    }
  };

  if (!request) {
    return error ? <Alert tone="error">{error}</Alert> : <p className="oauth-consent__text">Checking the request…</p>;
  }
  return (
    <>
      <h1 className="oauth-consent__title">Connect {request.app_name} to GrepThink?</h1>
      <p className="oauth-consent__text">
        {request.app_name} will be able to read your teams' scrum boards and add items to them, as you. It can't
        change or delete anything already there, and you can disconnect it in Settings.
      </p>
      <p className="oauth-consent__account">
        {email && (
          <>
            Signed in as <strong>{email}</strong>.{' '}
          </>
        )}
        You'll go back to <strong>{request.redirect_host}</strong>.
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
  const requestId = searchParams.get('request');
  const here = location.pathname + location.search;

  const signedOut = Boolean(requestId) && !loading && !user;
  React.useEffect(() => {
    if (loading) return;
    // Google sign-in leaves the site and comes back through /auth/callback, which reads this;
    // once signed in here it is spent, so a later Google sign-in in this tab goes home.
    if (!user) rememberReturnTo(here);
    else takeReturnTo();
  }, [loading, user, here]);

  if (signedOut) {
    return <Navigate to="/login" replace state={{ from: here }} />;
  }

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="oauth-consent">
        <div className="oauth-consent__card">
          {!requestId ? (
            <Alert tone="error">{INCOMPLETE}</Alert>
          ) : loading ? (
            <p className="oauth-consent__text">Checking your sign-in…</p>
          ) : (
            <ConsentCard key={requestId} requestId={requestId} email={user?.email} />
          )}
        </div>
      </div>
    </>
  );
};

export default OAuthConsent;
