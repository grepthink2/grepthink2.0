/**
 * The page an unsubscribe link in an email opens, signed out (`/unsubscribe?token=...`). It asks
 * the backend what the link is for, then turns that category of email off when the reader
 * confirms. Opening the link changes nothing, so a mail scanner that follows it cannot
 * unsubscribe anyone. Both requests are public: the token in the URL is the credential.
 */
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type ApiUnsubscribeInfo, type ApiUnsubscribeResult } from '@/lib/api';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import './Unsubscribe.scss';

const UNSUBSCRIBE_FAILED = 'Could not unsubscribe. Try again later.';

/** What the card shows; `label` is the email category's name, e.g. "Deadline reminders". */
type View =
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'ready'; label: string }
  | { kind: 'done'; label: string };

/**
 * `info` is what the backend said about the token: `undefined` until it answers, `null` when it
 * could not say. A link it cannot name a category for is no use, so it reads as not valid.
 */
function viewOf(
  token: string | null,
  info: ApiUnsubscribeInfo | null | undefined,
  result: ApiUnsubscribeResult | null,
): View {
  if (result) return { kind: 'done', label: result.label };
  if (!token) return { kind: 'invalid' };
  if (info === undefined) return { kind: 'checking' };
  if (info?.valid && info.label) return { kind: 'ready', label: info.label };
  return { kind: 'invalid' };
}

function copyFor(view: View): { heading: string; text: string } {
  switch (view.kind) {
    case 'checking':
      return { heading: 'Unsubscribe', text: 'Checking your link…' };
    case 'invalid':
      return { heading: 'Unsubscribe', text: "This unsubscribe link isn't valid. It may be incomplete." };
    case 'ready':
      return {
        heading: `Unsubscribe from ${view.label}?`,
        text: `You'll stop getting ${view.label.toLowerCase()} from GrepThink.`,
      };
    case 'done':
      return {
        heading: 'Unsubscribed',
        text: `You're unsubscribed from ${view.label}. You can turn these emails back on in Settings.`,
      };
  }
}

/** One link's card. Keyed by its token (see `Unsubscribe`), so a new link starts from scratch. */
const UnsubscribeCard: React.FC<{ token: string | null }> = ({ token }) => {
  const [info, setInfo] = React.useState<ApiUnsubscribeInfo | null | undefined>(undefined);
  const [result, setResult] = React.useState<ApiUnsubscribeResult | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api.getUnsubscribeInfo(token).then((answer) => {
      if (!cancelled) setInfo(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setConfirming(true);
    setError(null);
    try {
      setResult(await api.confirmUnsubscribe(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : UNSUBSCRIBE_FAILED);
    } finally {
      setConfirming(false);
    }
  };

  const view = viewOf(token, info, result);
  const { heading, text } = copyFor(view);

  return (
    <>
      <h1 className="unsubscribe__title">{heading}</h1>
      {/* One paragraph whose text follows the page's state, so a screen reader announces each change. */}
      <p className="unsubscribe__text" aria-live="polite">
        {text}
      </p>
      {view.kind === 'ready' && (
        <button type="button" className="unsubscribe__button" onClick={confirm} disabled={confirming}>
          {confirming ? 'Unsubscribing…' : 'Unsubscribe'}
        </button>
      )}
      {error && (
        <p className="unsubscribe__error" role="alert">
          {error}
        </p>
      )}
      <Link to="/" className="unsubscribe__link">
        Go to GrepThink
      </Link>
    </>
  );
};

const Unsubscribe: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="unsubscribe">
        <div className="unsubscribe__card">
          <UnsubscribeCard key={token ?? ''} token={token} />
        </div>
      </div>
    </>
  );
};

export default Unsubscribe;
