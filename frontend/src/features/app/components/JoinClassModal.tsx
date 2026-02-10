import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import './JoinClassModal.scss';

interface JoinClassModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const JoinClassModal: React.FC<JoinClassModalProps> = ({ isOpen, onClose }) => {
  const [code, setCode] = useState(['', '', '', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { refreshClasses } = useClass();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', '', '', '', '', '']);
      setError(null);
      setSuccess(false);
      // Focus first input after a brief delay
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleCodeChange = (index: number, value: string) => {
    // Only allow alphanumeric characters (uppercase)
    const upperValue = value.toUpperCase();
    if (value && !/^[A-Z0-9]$/.test(upperValue)) return;
    
    const newCode = [...code];
    newCode[index] = upperValue;
    setCode(newCode);

    // Move to next input if value is entered
    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 8 characters are filled
    if (value && index === 7 && newCode.every(char => char !== '')) {
      handleJoinClass(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').toUpperCase().slice(0, 8);
    const chars = pastedData.split('').filter(char => /^[A-Z0-9]$/.test(char));
    
    if (chars.length > 0) {
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (i < 8) newCode[i] = char;
      });
      setCode(newCode);
      
      // Focus the next empty input or the last one
      const nextEmptyIndex = newCode.findIndex(c => c === '');
      if (nextEmptyIndex !== -1) {
        inputRefs.current[nextEmptyIndex]?.focus();
      } else {
        inputRefs.current[7]?.focus();
        // Auto-submit if all characters are filled
        if (newCode.every(char => char !== '')) {
          handleJoinClass(newCode.join(''));
        }
      }
    }
  };

  const handleJoinClass = async (courseCode: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await api.joinClass(courseCode);
      setSuccess(true);
      
      // Refresh the classes list
      await refreshClasses();

      // Close modal after a brief success message
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to join class:', err);
      setError(err instanceof Error ? err.message : 'Failed to join class');
      // Clear the code on error
      setCode(['', '', '', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="join-class-modal-backdrop" onClick={handleClose}>
      <div className="join-class-modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="join-class-modal__close"
          onClick={handleClose}
          disabled={isSubmitting}
          aria-label="Close modal"
        >
          <X size={24} />
        </button>

        <div className="join-class-modal__content">
          <h1 className="join-class-modal__title">Join Class</h1>
          <p className="join-class-modal__subtitle">
            Enter the 8-character class code provided by your instructor
          </p>

          {error && (
            <div className="join-class-modal__error">
              {error}
            </div>
          )}

          {success && (
            <div className="join-class-modal__success">
              Successfully joined class!
            </div>
          )}

          <div className="join-class-modal__code-container">
            {code.map((char, index) => (
              <input
                key={index}
                ref={el => { inputRefs.current[index] = el; }}
                type="text"
                maxLength={1}
                className="join-class-modal__code-input"
                value={char}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={isSubmitting || success}
                autoComplete="off"
              />
            ))}
          </div>

          {isSubmitting && (
            <p className="join-class-modal__status">Joining class...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default JoinClassModal;
