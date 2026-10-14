import React, { useId, useState } from 'react';
import MarkdownText from '@components/Markdown/MarkdownText';
import { API_BASE_URL } from '../apiBase';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'filed'; number: number; url: string }
  | { kind: 'emailed' }
  | { kind: 'rejected'; detail: string }
  | { kind: 'error' };

interface IssueReportResponse {
  issue_number: number | null;
  issue_url: string | null;
}

/** The repository's name in an issue URL: https://github.com/<owner>/<repo>/issues/<n>. */
const repoOf = (url: string) => /^https:\/\/github\.com\/[^/]+\/([^/]+)\/issues\//.exec(url)?.[1] ?? '';

/** A 400's `detail`, which the form shows as written; null when there isn't one. */
async function detailOf(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : null;
  } catch {
    return null;
  }
}

/**
 * The "Submit an issue" card. POST /api/issues files the report as a public GitHub issue and
 * emails the maintainer the reporter's address, which never appears in the issue. The hidden
 * `website` field is the same honeypot the contact card uses.
 */
const IssueCard: React.FC = () => {
  const [githubUser, setGithubUser] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const userId = useId();
  const descriptionId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (outcome.kind === 'sending') return;
    // `required` accepts spaces, and the textarea is not in the form while Preview shows.
    if (!title.trim() || !description.trim()) {
      setOutcome({ kind: 'rejected', detail: 'Add a title and a description.' });
      return;
    }

    setOutcome({ kind: 'sending' });
    try {
      const res = await fetch(`${API_BASE_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_user: githubUser, email, title, description, website }),
      });

      if (res.status === 400) {
        const detail = await detailOf(res);
        setOutcome(detail ? { kind: 'rejected', detail } : { kind: 'error' });
        return;
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const data = (await res.json()) as IssueReportResponse;
      setOutcome(
        data.issue_number !== null && data.issue_url
          ? { kind: 'filed', number: data.issue_number, url: data.issue_url }
          : { kind: 'emailed' },
      );
      setGithubUser('');
      setEmail('');
      setTitle('');
      setDescription('');
      setWebsite('');
      setMode('write');
    } catch {
      setOutcome({ kind: 'error' });
    }
  };

  const sending = outcome.kind === 'sending';

  return (
    <div className="contact-page__card">
      <span className="contact-page__eyebrow">Issue</span>
      <h2 className="contact-page__title">Submit an issue</h2>
      <p className="contact-page__sub">
        Found a bug or have a request? It goes straight to our public tracker on GitHub.
      </p>

      <form className="contact-page__form" onSubmit={handleSubmit}>
        <div className="contact-page__field">
          <label htmlFor={userId}>
            <span>GitHub username</span>
          </label>
          <div className="contact-page__prefixed">
            <span className="contact-page__prefix" aria-hidden="true">@</span>
            <input
              id={userId}
              type="text"
              name="github_user"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={39}
              placeholder="octocat"
              value={githubUser}
              onChange={(e) => setGithubUser(e.target.value.replace(/^@+/, ''))}
              required
            />
          </div>
        </div>
        <label className="contact-page__field">
          <span>School email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="contact-page__field">
          <span>Title</span>
          <input
            type="text"
            name="title"
            maxLength={120}
            placeholder="A short summary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <div className="contact-page__field">
          <div className="contact-page__field-head">
            <label htmlFor={descriptionId}>
              <span>Description</span>
            </label>
            <div className="contact-page__tabs" role="group" aria-label="Description view">
              <button type="button" aria-pressed={mode === 'write'} onClick={() => setMode('write')}>
                Write
              </button>
              <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
                Preview
              </button>
            </div>
          </div>
          {mode === 'write' ? (
            <textarea
              id={descriptionId}
              name="description"
              rows={6}
              maxLength={10000}
              placeholder="What happened, and what did you expect?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          ) : (
            <div className="contact-page__preview">
              {description.trim() ? (
                <MarkdownText>{description}</MarkdownText>
              ) : (
                <p className="contact-page__preview-empty">Nothing to preview yet.</p>
              )}
            </div>
          )}
          <p className="contact-page__hint">
            Markdown is supported. The issue is public; your email stays private.
          </p>
        </div>

        {/* Honeypot: hidden from humans, attractive to bots. */}
        <div className="contact-page__honeypot" aria-hidden="true">
          <label>
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="contact-page__submit" disabled={sending}>
          {sending ? 'Sending…' : 'Submit issue'}
        </button>

        {outcome.kind === 'filed' && (
          <p className="contact-page__status contact-page__status--success" role="status">
            Filed as {repoOf(outcome.url)}
            <a href={outcome.url} target="_blank" rel="noreferrer">#{outcome.number}</a>
          </p>
        )}
        {outcome.kind === 'emailed' && (
          <p className="contact-page__status contact-page__status--success" role="status">
            Thanks, your report reached us by email. We&apos;ll file it on GitHub ourselves.
          </p>
        )}
        {outcome.kind === 'rejected' && (
          <p className="contact-page__status contact-page__status--error" role="alert">
            {outcome.detail}
          </p>
        )}
        {outcome.kind === 'error' && (
          <p className="contact-page__status contact-page__status--error" role="alert">
            Something went wrong sending your report. Please try again.
          </p>
        )}
      </form>
    </div>
  );
};

export default IssueCard;
