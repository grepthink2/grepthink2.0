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
  const [history, setHistory] = useState<string[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Use setSuccessMessage to display mint green "Successfully enrolled" popup on MyClasses page
  const { refreshClasses, setSuccessMessage } = useClass();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', '', '', '', '', '']);
      setHistory([]);
      setHistoryIndex(-1);
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

    // Save to history: slice to current index, then append new state
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newCode);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

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
    // Handle Ctrl+Z for undo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        const previousCode = history[newIndex];
        setHistoryIndex(newIndex);
        setCode(previousCode);

        // Focus the input that was just undone
        inputRefs.current[index]?.focus();
      }
      return;
    }

    // Handle Ctrl+Y for redo
    if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        const nextCode = history[newIndex];
        setHistoryIndex(newIndex);
        setCode(nextCode);

        // Focus the input that was just redone
        inputRefs.current[index]?.focus();
      }
      return;
    }

    if (e.key === 'Backspace' && !code[index] && index > 0) {
      // Save to history before backspace navigation
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(code);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
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

      // Save to history: slice to current index, then append new state
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newCode);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

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
      const response = await api.joinClass(courseCode);

      // Check if already enrolled
      if (response.message?.toLowerCase().includes('already enrolled')) {
        setError('You are already enrolled in this class');
        return;
      }

      // Get class name from response
      const className = response.class?.name || 'class';

      // Set success message for MyClasses page
      setSuccessMessage(`Successfully enrolled in ${className}`);

      setSuccess(true);

      // Refresh the classes list without loading state
      await refreshClasses(false);

      // Close modal after a brief success message
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to join class:', err);
      setError(err instanceof Error ? err.message : 'Failed to join class');
      // Clear the code and history on error
      setCode(['', '', '', '', '', '', '', '']);
      setHistory([]);
      setHistoryIndex(-1);
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

        <div className="join-class-modal__header">
          <h1 className="join-class-modal__title">Join a New Course</h1>
          <p className="join-class-modal__subtitle">Enter your eight-digit code to enroll.</p>
        </div>

        <div className="join-class-modal__body">
          <label className="join-class-access_code">ACCESS CODE</label>
          <div className="join-class-modal__code-inputs">
            {code.map((char, i) => (
              <div key={i} className="join-class-modal__code-input-wrapper">
                <input
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  maxLength={1}
                  className="join-class-modal__code-input"
                  value={char}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  disabled={isSubmitting || success}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>

          <div className="join-class-modal__info">
            <div className="join-class-modal__info-icon">
              <span>i</span>
            </div>
            <p className="join-class-disclaimer">Ask your instructor if you don't have a code.</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="join-class-modal__message join-class-modal__message--error">
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="join-class-modal__message join-class-modal__message--success">
            Successfully joined class!
          </div>
        )}

        {/* Footer */}
        <div className="join-class-modal__footer">
          <button
            className="join-class-modal__button join-class-modal__button--cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="join-class-modal__button join-class-modal__button--submit"
            disabled={isSubmitting}
          >
            Join Course
          </button>
        </div>
      </div>
    </div>
  );
};


export default JoinClassModal;
