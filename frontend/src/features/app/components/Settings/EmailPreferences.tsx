import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { api, ApiError, type ApiEmailPreference } from '@/lib/api';

const LOAD_FAILED = "Couldn't load your email settings.";
const SAVE_FAILED = "Couldn't save that change. Try again.";

/**
 * What to tell the reader about a failed request: the backend's own text for a 400 (what was
 * wrong) or a 503 (down for now, e.g. "Email preferences are not available yet"), else `fallback`.
 * Any other failure would show a status code, a server message ("Internal server error") or the
 * browser's own ("Failed to fetch").
 */
function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError && (err.status === 400 || err.status === 503)) {
    if (typeof err.detail === 'string' && err.detail) return err.detail;
  }
  return fallback;
}

/** One switch per category of optional email, saved as soon as it is flipped. */
const PreferenceSwitches: React.FC<{ initial: ApiEmailPreference[] }> = ({ initial }) => {
  const baseId = useId();
  const [preferences, setPreferences] = useState(initial);
  // One save at a time, and every switch is disabled during it: a save answers with the whole
  // list, so two in flight could each replace the other's change with a list that lacks it.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The switch that had focus when its save began. Browsers may drop focus from a control that
  // becomes disabled (the HTML focus fixup rule), so it is handed back once the switches are
  // enabled again and a keyboard user stays where they were.
  const refocus = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const control = refocus.current;
    if (saving || !control) return;
    refocus.current = null;
    // Only when focus was lost: if the user has moved on to something else, it stays there.
    const active = document.activeElement;
    if (!active || active === document.body || active === control) control.focus();
  }, [saving]);

  const save = async (category: string, enabled: boolean, control: HTMLInputElement) => {
    const before = preferences;
    if (document.activeElement === control) refocus.current = control;
    setSaving(true);
    setError(null);
    // Show the change at once; the answer replaces it, and a failure puts `before` back.
    setPreferences(before.map((p) => (p.category === category ? { ...p, enabled } : p)));
    try {
      const saved = await api.updateEmailPreferences({ [category]: enabled });
      setPreferences(saved.preferences);
    } catch (err) {
      setPreferences(before);
      setError(messageFor(err, SAVE_FAILED));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ul className="settings-modal__pref-list">
        {preferences.map((p) => {
          const switchId = `${baseId}-${p.category}`;
          const descriptionId = `${switchId}-description`;
          return (
            <li key={p.category} className="settings-modal__pref">
              <div className="settings-modal__pref-text">
                <label className="settings-modal__pref-label" htmlFor={switchId}>
                  {p.label}
                </label>
                <p className="settings-modal__pref-description" id={descriptionId}>
                  {p.description}
                </p>
              </div>
              <input
                id={switchId}
                type="checkbox"
                role="switch"
                className="settings-modal__switch"
                checked={p.enabled}
                disabled={saving}
                aria-describedby={descriptionId}
                onChange={(e) => void save(p.category, e.currentTarget.checked, e.currentTarget)}
              />
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="settings-modal__feedback settings-modal__feedback--error" role="alert">
          <AlertCircle size={15} />
          {error}
        </p>
      )}
    </>
  );
};

/**
 * The Email section of Settings: which optional emails GrepThink sends this account. The backend
 * owns the categories. Invites and verification codes are not optional, so they are not listed.
 * Mounted while the section is shown, so each visit reads the saved settings again.
 */
const EmailPreferences: React.FC = () => {
  const [preferences, setPreferences] = useState<ApiEmailPreference[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The heading stays through every state, so it is where focus goes when "Try again" is replaced
  // by the loading text: focus on a control that goes away falls to the page.
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getEmailPreferences()
      .then((res) => {
        if (!cancelled) setPreferences(res.preferences);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(messageFor(err, LOAD_FAILED));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    headingRef.current?.focus();
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  return (
    <>
      <h3 ref={headingRef} tabIndex={-1} className="settings-modal__section-title">
        Email
      </h3>
      <p className="settings-modal__section-subtitle">
        Choose which emails GrepThink sends you. Class invites and verification codes are always sent.
      </p>
      {preferences ? (
        <PreferenceSwitches initial={preferences} />
      ) : loadError ? (
        <>
          <p className="settings-modal__feedback settings-modal__feedback--error" role="alert">
            <AlertCircle size={15} />
            {loadError}
          </p>
          <button type="button" className="settings-modal__retry" onClick={retry}>
            Try again
          </button>
        </>
      ) : (
        <p className="settings-modal__pref-status" role="status">
          Loading…
        </p>
      )}
    </>
  );
};

export default EmailPreferences;
