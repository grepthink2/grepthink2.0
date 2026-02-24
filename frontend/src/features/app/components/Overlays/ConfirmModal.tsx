import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import './ConfirmModal.scss';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  return (
    <div className="confirm-modal-backdrop" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="confirm-modal__close"
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
        <div className="confirm-modal__content">
          <h1 className="confirm-modal__title">{title}</h1>
          <p className="confirm-modal__message">{message}</p>
          <div className="confirm-modal__actions">
            <button
              className="confirm-modal__button confirm-modal__button--cancel"
              onClick={handleCancelClick}
            >
              {cancelText}
            </button>
            <button
              className="confirm-modal__button confirm-modal__button--confirm"
              onClick={handleConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
