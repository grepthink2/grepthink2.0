import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import './AddStudentModal.scss';

export interface AddStudentPayload {
  firstName: string;
  lastName: string;
  email: string;
}

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AddStudentPayload) => void;
  isSubmitting: boolean;
  errorMessage?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFirstName('');
      setLastName('');
      setEmail('');
      setTouched(false);
      setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); },
    [handleClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const isValid = trimmedFirst.length > 0 && trimmedLast.length > 0 && emailValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid || isSubmitting) return;
    onSubmit({ firstName: trimmedFirst, lastName: trimmedLast, email: trimmedEmail });
  };

  if (!isOpen) return null;

  const modal = (
    <div
      className="add-student-modal__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-student-modal-title"
    >
      <form className="add-student-modal" onSubmit={handleSubmit}>
        <div className="add-student-modal__header">
          <h2 className="add-student-modal__title" id="add-student-modal-title">
            Add Student
          </h2>
          <button
            className="add-student-modal__close"
            onClick={handleClose}
            type="button"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="add-student-modal__body">
          <p className="add-student-modal__hint">
            Manually adds a student to the roster with a status of Manual. This
            student stays on the roster even if you upload a new roster file.
          </p>

          <div className="add-student-modal__field">
            <label className="add-student-modal__field-label" htmlFor="add-student-first-name">
              First Name
            </label>
            <input
              id="add-student-first-name"
              ref={firstFieldRef}
              className={`add-student-modal__field-input${touched && !trimmedFirst ? ' add-student-modal__field-input--error' : ''}`}
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jane"
              autoComplete="given-name"
            />
          </div>

          <div className="add-student-modal__field">
            <label className="add-student-modal__field-label" htmlFor="add-student-last-name">
              Last Name
            </label>
            <input
              id="add-student-last-name"
              className={`add-student-modal__field-input${touched && !trimmedLast ? ' add-student-modal__field-input--error' : ''}`}
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe"
              autoComplete="family-name"
            />
          </div>

          <div className="add-student-modal__field">
            <label className="add-student-modal__field-label" htmlFor="add-student-email">
              Email
            </label>
            <input
              id="add-student-email"
              className={`add-student-modal__field-input${touched && !emailValid ? ' add-student-modal__field-input--error' : ''}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane.doe@example.com"
              autoComplete="email"
            />
          </div>

          {errorMessage && (
            <p className="add-student-modal__error" role="alert">{errorMessage}</p>
          )}
        </div>

        <div className="add-student-modal__footer">
          <button
            type="button"
            className="add-student-modal__btn add-student-modal__btn--cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="add-student-modal__btn add-student-modal__btn--add"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 size={14} className="add-student-modal__spinner" />}
            {isSubmitting ? 'Adding…' : 'Add Student'}
          </button>
        </div>
      </form>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default AddStudentModal;
