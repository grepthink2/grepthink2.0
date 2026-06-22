import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import './RequestModal.scss';

const MAX_MESSAGE_LENGTH = 500;

interface RequestModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const RequestModal: React.FC<RequestModalProps> = ({ isOpen, projectId, onClose, onSuccess }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.requestJoinProject(projectId, message);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setMessage('');
    setError(null);
    onClose();
  };

  const remaining = MAX_MESSAGE_LENGTH - message.length;

  return (
    <div className="request-modal-backdrop" onClick={onClose}>
      <div className="request-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="request-modal__close"
          onClick={onClose}
          type="button"
          aria-label="Close modal"
          disabled={loading}
        >
          <X size={24} />
        </button>
        <form className="request-modal__content" onSubmit={handleSubmit}>
          <h2 className="request-modal__title">Project Request</h2>
          {error && (
            <p className="request-modal__error" role="alert">
              {error}
            </p>
          )}
          <div className="request-modal__field">
            <label htmlFor="request-message" className="request-modal__label">
              Add a message (optional)
            </label>
            <div className="request-modal__textarea-wrap">
              <textarea
                id="request-message"
                className="request-modal__textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                placeholder="Introduce yourself or say why you'd like to join..."
                rows={5}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={loading}
              />
              <span className="request-modal__char-count" aria-live="polite">
                {remaining}
              </span>
            </div>
          </div>
          <div className="request-modal__actions">
            <button
              type="button"
              className="request-modal__button request-modal__button--cancel"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="request-modal__button request-modal__button--submit"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RequestModal;
