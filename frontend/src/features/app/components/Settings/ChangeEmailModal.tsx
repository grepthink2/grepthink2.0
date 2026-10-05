import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import '@features/app/components/Classes/JoinClassModal.scss';

interface ChangeEmailModalProps {
  isOpen: boolean;
  /** The address the account logs in with today. */
  currentEmail: string;
  onClose: () => void;
}

// The same plain-mailbox shape the backend accepts for a roster email: one address, no
// whitespace, so the typo "two@addresses, here" is refused before Supabase sees it.
const MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Changes the login email through Supabase Auth. Supabase emails the new address a
 * confirmation link and applies the change only when it is opened (with "Secure email
 * change" on, the current address gets one too and both must be opened). Until then the
 * account, and the profile row the backend mirrors from the token, keep the old address.
 */
const ChangeEmailModal: React.FC<ChangeEmailModalProps> = ({ isOpen, currentEmail, onClose }) => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset each time the modal opens: adjusted during render when isOpen flips, while the
  // delayed focus stays in an effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setEmail('');
      setError(null);
      setSentTo(null);
    }
  }

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!MAILBOX.test(next)) {
      setError('Enter a valid email address.');
      return;
    }
    if (next === currentEmail.trim().toLowerCase()) {
      setError('That is already your login email.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Refused here when the address belongs to another account; with the check
      // unavailable Supabase decides.
      const check = await api.checkEmail(next);
      if (check && !check.available) {
        setError('This email is already linked to another account.');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: `${window.location.origin}/auth/callback?source=email-change` },
      );
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSentTo(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the email change.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="join-class-modal-backdrop" onClick={onClose}>
      <div
        className="join-class-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Change email address"
      >
        <button
          className="join-class-modal__close"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <div className="join-class-modal__content">
          <h1 className="join-class-modal__title">Change email address</h1>

          {sentTo ? (
            <>
              <div className="join-class-modal__success" role="status">
                We sent a confirmation link to <strong>{sentTo}</strong>.
              </div>
              <p className="join-class-modal__subtitle">
                Your login email stays <strong>{currentEmail}</strong> until you open it. If your
                current address also receives a link, open both.
              </p>
              <button type="button" className="settings-modal__save" onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <form className="settings-modal__form" onSubmit={submit} noValidate>
              <p className="join-class-modal__subtitle">
                You sign in as <strong>{currentEmail}</strong>. We will email the new address a
                confirmation link; nothing changes until you open it.
              </p>

              {error && <div className="join-class-modal__error" role="alert">{error}</div>}

              <div className="settings-modal__field">
                <label className="settings-modal__label" htmlFor="change-email-new">
                  New email address
                </label>
                <input
                  ref={inputRef}
                  id="change-email-new"
                  type="email"
                  className="settings-modal__input"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={submitting}
                />
              </div>

              <button type="submit" className="settings-modal__save" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send confirmation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangeEmailModal;
