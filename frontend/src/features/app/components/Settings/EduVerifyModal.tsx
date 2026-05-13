import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import '@features/app/components/Classes/JoinClassModal.scss';

interface EduVerifyModalProps {
  isOpen: boolean;
  eduEmail: string;
  onVerified: () => void;
  onClose: () => void;
}

const EduVerifyModal: React.FC<EduVerifyModalProps> = ({
  isOpen,
  eduEmail,
  onVerified,
  onClose,
}) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', '', '', '']);
      setError(null);
      setSuccess(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const submit = async (codeStr: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/api/profiles/verify-edu-email', {
        method: 'POST',
        body: JSON.stringify({ edu_email: eduEmail, code: codeStr }),
      });
      setSuccess(true);
      setTimeout(() => {
        onVerified();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (value && index === 5 && next.every((c) => c !== '')) {
      submit(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const chars = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (!chars.length) return;
    const next = [...code];
    chars.forEach((c, i) => { if (i < 6) next[i] = c; });
    setCode(next);
    const nextEmpty = next.findIndex((c) => c === '');
    if (nextEmpty !== -1) {
      inputRefs.current[nextEmpty]?.focus();
    } else {
      inputRefs.current[5]?.focus();
      if (next.every((c) => c !== '')) submit(next.join(''));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="join-class-modal-backdrop" onClick={onClose}>
      <div className="join-class-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="join-class-modal__close"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <div className="join-class-modal__content">
          <h1 className="join-class-modal__title">Verify .edu Email</h1>
          <p className="join-class-modal__subtitle">
            Enter the 6-digit code sent to
            <br />
            <strong>{eduEmail}</strong>
          </p>

          {error && <div className="join-class-modal__error">{error}</div>}
          {success && <div className="join-class-modal__success">Email verified!</div>}

          <div className="join-class-modal__code-container">
            {code.map((char, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="join-class-modal__code-input"
                value={char}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={submitting || success}
                autoComplete="off"
              />
            ))}
          </div>

          {submitting && <p className="join-class-modal__status">Verifying…</p>}
        </div>
      </div>
    </div>
  );
};

export default EduVerifyModal;
